import { randomInt, timingSafeEqual } from 'node:crypto';
import { BASE_PATH, CHESS, type ChessBoard, type Color, type LiveFrame, type LiveSession, type MatchLive, type MatchRecord, type MatchRes, type MatchView, type MoveGrade, type QueueRes, type SeatInfo, type SeatKind, type SeatOut } from '@arcadebench/api';
import { accuracy, ascii, CAPS, ending, LEVELS, material, parse, Pos, san, scene, START, tier, uci } from '@arcadebench/engine';
import { nextElo } from './elo.ts';
import type { Db, Entry } from './db.ts';
import { limiter } from './limit.ts';
import type { RunIn } from './runs.ts';
import { bad, name, pick } from './validate.ts';
import { Fail, log, logError, quiet, rid, sha256 } from './util.ts';
import type { Pool } from './work.ts';

export const WATCH_MS = 10 * 60_000, MAX_OPEN = 400, RATED_PLIES = 4, DRAW_LEAD = 100;
const SEAT = /^[A-Za-z0-9_-]{16,64}$/, UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/, COLORS: Color[] = ['white', 'black'];

type Sub = (f: LiveFrame) => void;
interface Seat { kind: SeatKind; level: number; hash: string; entry: Entry | null; name: string | null; joined: boolean }
interface M {
  id: string; watch: string; owner: string; seed: number; seat: [Seat, Seat]; fen: string; reps: number[]; moves: string[]; sans: string[]; grades: (MoveGrade | null)[];
  res: number | null; why: string; draw: number; created: number; moved: number; subs: Set<Sub>; pending: Set<Promise<unknown>>; busy: boolean; runId?: string; end?: { at: number; frame: LiveFrame };
}
interface Waiting { hash: string; entry: Entry | null; kind: SeatKind; color: Color | 'any'; name: string | null; created: number; fallback: { level: number; at: number } | null; ready?: { id: string; token: string; color: Color } }
interface Rating { elo: number; games: number; wins: number; draws: number; losses: number; acc: number; accn: number; blunders: number }
interface Deps { db: Db; pool: Pool; now: () => number; origin: string; pace: number; save: (r: RunIn, match: object) => string }

const turn = (m: M) => +(m.fen.split(' ')[1] === 'b');
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const label = (res: number) => (res === 1 ? '1-0' : res === 0 ? '0-1' : '1/2-1/2') as MatchView['result'];
const sleep = (ms: number) => new Promise<void>((r) => (ms ? setTimeout(r, ms).unref() : r()));
const fits = (c: Color | 'any', d: Color | 'any') => c === 'any' || d === 'any' || c !== d;

export function makeMatches({ db, pool, now, origin, pace, save }: Deps) {
  const matches = new Map<string, M>(), watches = new Map<string, M>(), queue: Waiting[] = [];
  const makes = limiter(CHESS.perHour, 3600_000, now, 'too many matches started; try again later'), queues = limiter(CHESS.perHour, 3600_000, now, 'too many queue requests; try again later');

  const rating = (entry: string) => db.get<Rating>('SELECT * FROM ratings WHERE entry = ?', entry);
  const info = (s: Seat): SeatInfo => ({
    kind: s.kind, name: s.kind === 'computer' ? `Computer level ${s.level}` : s.joined ? s.name : null, ...(s.kind === 'computer' && { level: s.level }),
    ...(s.entry?.listing === 'listed' && { x: s.entry.x }), joined: s.joined, elo: s.kind === 'computer' ? LEVELS[s.level - 1].elo : s.entry?.listing === 'listed' ? Math.round(rating(s.entry.id)?.elo ?? CHESS.start) : null,
  });
  const mean = (m: M, c: number) => { const v = m.grades.flatMap((g, i) => (g && i % 2 === c ? [g.accuracy] : [])); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const live = (m: M): MatchLive => ({
    white: info(m.seat[0]), black: info(m.seat[1]), status: m.res !== null ? 'done' : m.seat.every((s) => s.joined) ? 'live' : 'open', result: m.res === null ? null : label(m.res), why: m.why,
    draw: m.draw < 0 ? null : COLORS[m.draw], sans: m.sans, accuracy: [mean(m, 0), mean(m, 1)], grades: m.grades,
    deadline: m.res === null && m.seat.every((s) => s.joined) ? new Date(m.moved + CHESS.moveMs).toISOString() : null,
  });
  const watchUrl = (m: M) => `${origin}${BASE_PATH}/watch/${m.watch}`;

  function view(m: M, you?: number): MatchView {
    const l = live(m), p = Pos.fen(m.fen, m.reps), mine = you !== undefined && l.status === 'live' && turn(m) === you;
    return { id: m.id, watch: m.watch, watchUrl: watchUrl(m), status: l.status, white: l.white, black: l.black, turn: COLORS[turn(m)], fen: m.fen, moves: m.moves, sans: m.sans, result: l.result, why: m.why, draw: l.draw, deadline: l.deadline, accuracy: l.accuracy, grades: m.grades,
      ...(m.runId && { runId: m.runId }), ...(you !== undefined && { you: COLORS[you], board: ascii(p), ...(mine && { legal: p.legal().map((x) => ({ id: uci(x), san: san(p, x) })) }) }) };
  }

  function frame(m: M): LiveFrame {
    if (m.end) return m.end.frame;
    const p = Pos.fen(m.fen, m.reps), l = live(m), g = m.grades.at(-1), t = [0, 1, 2].map((x) => m.grades.filter((y) => y && y.tier === x + 1).length);
    const say = m.res === null ? '' : `${m.res === 0.5 ? 'Draw' : m.res === 1 ? 'White wins' : 'Black wins'} · ${m.why}`;
    return {
      watch: m.watch, game: 'chess', seedCode: '', mode: 'match', entry: null, step: m.moves.length, score: m.res ?? 0, done: false,
      data: { ...scene(p, m.moves.at(-1) ?? ''), you: 'w', res: m.res, why: m.why, verdict: l.result ?? 'playing', say, accs: l.accuracy, acc: null, tiers: t, moves: p.full, level: 0 },
      last: g ? { step: m.moves.length - 1, action: m.moves.at(-1)!, expert: g.best, regret: g.loss, agree: g.loss < 1e-9, invalid: false } : null,
      regrets: m.grades.flatMap((x) => (x ? [x.loss] : [])), medianMs: null, match: l,
    };
  }
  const notify = (m: M) => { if (m.subs.size) { const f = frame(m); for (const s of m.subs) s(f); } };

  function persist(m: M) {
    db.run('INSERT OR REPLACE INTO chess_live (id, data) VALUES (?, ?)', m.id, JSON.stringify({
      watch: m.watch, owner: m.owner, seed: m.seed, moves: m.moves, sans: m.sans, grades: m.grades, draw: m.draw, created: m.created, moved: m.moved,
      seat: m.seat.map((s) => ({ kind: s.kind, level: s.level, hash: s.hash, entry: s.entry?.id ?? null, name: s.name, joined: s.joined })),
    }));
  }

  function blank(owner: string, kinds: { kind: SeatKind; level: number }[]): { m: M; tokens: string[] } {
    const tokens = kinds.map(() => rid(24)), now0 = now();
    const m: M = {
      id: rid(9), watch: rid(12), owner, seed: randomInt(2 ** 31), fen: START, reps: Pos.fen(START).hist, moves: [], sans: [], grades: [], res: null, why: '', draw: -1, created: now0, moved: now0, subs: new Set(), pending: new Set(), busy: false,
      seat: kinds.map((k, i) => ({ ...k, hash: sha256(tokens[i]), entry: null, name: null, joined: k.kind === 'computer' })) as [Seat, Seat],
    };
    matches.set(m.id, m); watches.set(m.watch, m);
    return { m, tokens };
  }

  const spec = (v: unknown, field: string) => {
    const s = typeof v === 'string' ? v : '', c = /^computer:([1-5])$/.exec(s);
    return c ? { kind: 'computer' as const, level: +c[1] } : { kind: pick<string>(s, ['human', 'agent'], field) as SeatKind, level: 0 };
  };
  const checkSeat = (s: Seat, entry: Entry | null) => {
    if (s.kind === 'agent' && !entry) throw new Fail(401, 'AI agents join with their entry link');
    if (entry && (entry.kind === 'ai') !== (s.kind === 'agent')) throw new Fail(403, `this seat is for ${s.kind === 'agent' ? 'an AI agent' : 'a person'}`);
  };
  function claim(m: M, i: number, entry: Entry | null, display?: string) {
    const s = m.seat[i];
    checkSeat(s, entry);
    if (entry && m.seat.some((o, j) => j !== i && o.entry?.id === entry.id)) throw new Fail(409, 'one entry cannot take both seats');
    if (s.joined && s.entry?.id !== entry?.id) throw new Fail(409, 'this seat is already taken');
    if (!s.joined) {
      s.joined = true; s.entry = entry;
      s.name = entry ? (entry.listing === 'listed' ? (entry.kind === 'human' ? `@${entry.x}` : entry.name) : 'Anonymous') : display ?? 'Guest';
      if (m.seat.every((o) => o.joined)) m.moved = now();
      persist(m); notify(m);
      drive(m);
    }
  }

  const label24 = (v: unknown) => (v === undefined ? undefined : name(v, 'name', 24));

  function create(entry: Entry | null, owner: string, b: Record<string, unknown>): MatchRes {
    const kinds = [spec(b.white, 'white'), spec(b.black, 'black')], me = b.me === undefined ? -1 : COLORS.indexOf(pick(b.me, COLORS, 'me')), display = label24(b.name);
    if (me >= 0 && kinds[me].kind === 'computer') bad('me', 'must name a seat that is not the computer');
    if (me >= 0) checkSeat({ ...kinds[me], hash: '', entry: null, name: null, joined: false }, entry);
    let open = 0, mine = 0;
    for (const m of matches.values()) if (m.res === null) { open++; if (m.owner === owner) mine++; }
    if (mine >= CHESS.openPerOwner) throw new Fail(429, 'too many open matches; finish one first', 60);
    if (open >= MAX_OPEN) throw new Fail(503, 'server is at capacity; try again shortly', 30);
    makes(owner);
    const { m, tokens } = blank(owner, kinds);
    if (me >= 0) claim(m, me, entry, display);
    persist(m);
    drive(m);
    return out(m, tokens, me);
  }

  function out(m: M, tokens: string[], me: number): MatchRes {
    const seats = m.seat.map((s, i): SeatOut => (s.kind === 'computer' ? { color: COLORS[i], kind: s.kind, level: s.level } : { color: COLORS[i], kind: s.kind, ...(i !== me && { token: tokens[i], invite: `${origin}${BASE_PATH}/chess/${m.id}#${tokens[i]}` }) }));
    return { match: view(m, me < 0 ? undefined : me), seats, ...(me >= 0 && { token: tokens[me] }) };
  }

  const find = (id: string) => matches.get(id) ?? bad('match', 'unknown or expired match') as never;
  const seatOf = (m: M, token: unknown) => (typeof token === 'string' && SEAT.test(token) ? m.seat.findIndex((s) => s.kind !== 'computer' && same(s.hash, sha256(token))) : -1);
  function actor(m: M, entry: Entry | null, token: unknown): number {
    const t = seatOf(m, token), e = entry ? m.seat.findIndex((s) => s.entry?.id === entry.id) : -1;
    if (token !== undefined && t < 0) throw new Fail(403, 'invalid seat token');
    if (t >= 0 && e >= 0 && t !== e) throw new Fail(403, 'seat token and entry link belong to different seats');
    const i = t >= 0 ? t : e;
    if (i < 0) throw new Fail(401, 'send your seat token or the entry link that joined this match');
    return i;
  }

  function get(id: string, entry: Entry | null, token: unknown): MatchView {
    const m = matches.get(id);
    if (!m) throw new Fail(404, 'unknown or expired match');
    const i = token !== undefined ? actor(m, entry, token) : entry ? m.seat.findIndex((s) => s.entry?.id === entry.id) : -1;
    return view(m, i < 0 ? undefined : i);
  }

  function join(entry: Entry | null, id: string, b: Record<string, unknown>): MatchRes {
    const m = find(id), i = seatOf(m, b.seat);
    if (i < 0) throw new Fail(403, 'invalid seat token');
    claim(m, i, entry, label24(b.name));
    return { match: view(m, i), seats: [], token: b.seat as string };
  }

  function end(m: M, res: number, why: string) {
    if (m.res !== null) return;
    m.res = res; m.why = why; m.draw = -1;
    notify(m);
    Promise.allSettled([...m.pending]).then(() => finish(m)).catch((e) => { logError(e, { match: m.id }); });
  }

  function rate(m: M): MatchRecord['elo'] {
    if (m.moves.length < RATED_PLIES) return [null, null];
    const before = m.seat.map((s) => s.entry && rating(s.entry.id)), anchor = (i: number) => (m.seat[i].kind === 'computer' ? LEVELS[m.seat[i].level - 1].elo : before[i] ? before[i].elo : m.seat[i].entry ? CHESS.start : null);
    return m.seat.map((s, i) => {
      const opp = anchor(1 - i);
      if (!s.entry || opp === null) return null;
      const r = before[i] ?? { elo: CHESS.start, games: 0, wins: 0, draws: 0, losses: 0, acc: 0, accn: 0, blunders: 0 }, score = i ? 1 - m.res! : m.res!, a = mean(m, i);
      const after = nextElo(r.elo, r.games, opp, score);
      db.run('INSERT OR REPLACE INTO ratings (entry, elo, games, wins, draws, losses, acc, accn, blunders) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', s.entry.id, after, r.games + 1, r.wins + +(score === 1), r.draws + +(score === 0.5), r.losses + +(score === 0), r.acc + (a ?? 0), r.accn + +(a !== null), r.blunders + m.grades.filter((g, k) => g && k % 2 === i && g.tier === 3).length);
      return { before: Math.round(r.elo), after: Math.round(after) };
    });
  }

  function finish(m: M) {
    const l = live(m), tiers = [0, 1].map((c) => [1, 2, 3].map((t) => m.grades.filter((g, i) => g && i % 2 === c && g.tier === t).length));
    db.tx(() => {
      const elo = rate(m);
      m.runId = save({ entry: null, game: 'chess', seed: m.seed, repeat: 0, track: 'match', help: 0, cap: CAPS.chess, bench: false, score: m.res!, steps: m.moves.length, truncated: false, actions: m.moves, watch: m.watch,
        decisions: m.moves.map((a, step) => { const g = m.grades[step]; return g ? { step, action: a, expert: g.best, agree: g.loss < 1e-9, regret: g.loss, forced: false, invalid: false } : { step, action: a, expert: a, agree: true, regret: 0, forced: true, invalid: false }; }) },
      { ...l, elo, tiers } satisfies MatchRecord);
      db.run('DELETE FROM chess_live WHERE id = ?', m.id);
    });
    m.end = { at: now(), frame: { ...frame(m), done: true, runId: m.runId } };
    for (const s of m.subs) s(m.end.frame);
  }

  function play(m: M, i: number, mv: string) {
    if (m.res !== null) throw new Fail(409, 'the game is over');
    if (!m.seat.every((s) => s.joined)) throw new Fail(409, 'waiting for the other seat to join');
    if (turn(m) !== i) throw new Fail(409, 'it is not your turn');
    const p = Pos.fen(m.fen, m.reps), x = parse(p, mv), fen = m.fen, reps = m.reps, ms = p.legal();
    if (x < 0) throw new Fail(422, `illegal move "${mv}"; legal moves: ${ms.map(uci).join(', ')}`);
    m.moves.push(mv); m.sans.push(san(p, x)); m.grades.push(null);
    if (m.seat[i].kind !== 'computer' && ms.length > 1) {
      const ply = m.moves.length - 1, job = pool.run('grade', fen, reps, mv).then((g) => { m.grades[ply] = { ...g, accuracy: accuracy(g.loss), tier: tier(g.loss) }; notify(m); }, quiet);
      m.pending.add(job);
      job.finally(() => m.pending.delete(job));
    }
    p.make(x);
    m.fen = p.fen(); m.reps = p.hist.slice(-2 * (p.half + 1)); m.moved = now(); m.draw = -1;
    const e = ending(p);
    persist(m);
    if (e) end(m, e.win < 0 ? 0.5 : e.win === 0 ? 1 : 0, e.why);
    else { notify(m); drive(m); }
  }

  async function drive(m: M) {
    if (m.busy) return;
    m.busy = true;
    try {
      while (m.res === null && m.seat.every((s) => s.joined) && m.seat[turn(m)].kind === 'computer') {
        await sleep(pace);
        const ply = m.moves.length;
        let mv: string;
        try { mv = await pool.run('engine', m.fen, m.reps, m.seat[turn(m)].level, m.seed, ply); } catch (e) { quiet(e); await sleep(1000); continue; }
        if (m.res === null && m.moves.length === ply) play(m, turn(m), mv);
      }
    } finally { m.busy = false; }
  }

  function move(entry: Entry | null, id: string, b: Record<string, unknown>): MatchRes {
    const m = find(id), i = actor(m, entry, b.seat);
    play(m, i, typeof b.move === 'string' && UCI.test(b.move) ? b.move : bad('move', 'must be a UCI move such as e2e4 or e7e8q'));
    return { match: view(m, i), seats: [] };
  }

  function resign(entry: Entry | null, id: string, b: Record<string, unknown>): MatchRes {
    const m = find(id), i = actor(m, entry, b.seat);
    if (m.res !== null) throw new Fail(409, 'the game is over');
    if (!m.seat.every((s) => s.joined)) throw new Fail(409, 'waiting for the other seat to join');
    end(m, i ? 1 : 0, 'resignation');
    return { match: view(m, i), seats: [] };
  }

  function offer(entry: Entry | null, id: string, b: Record<string, unknown>): MatchRes {
    const m = find(id), i = actor(m, entry, b.seat), a = pick(b.action, ['offer', 'accept', 'decline'], 'action', 'offer');
    if (m.res !== null || !m.seat.every((s) => s.joined)) throw new Fail(409, 'there is no game to draw');
    if (a === 'offer') {
      if (m.seat[1 - i].kind !== 'computer') m.draw = i;
      else if ((i ? 1 : -1) * material(Pos.fen(m.fen, m.reps)) <= -DRAW_LEAD) end(m, 0.5, 'agreement');
    } else if (m.draw !== 1 - i) throw new Fail(409, 'the opponent has not offered a draw');
    else if (a === 'accept') end(m, 0.5, 'agreement');
    else m.draw = -1;
    notify(m);
    return { match: view(m, i), seats: [] };
  }

  function pair(a: Waiting, b: Waiting, owner: string) {
    const swap = a.color === 'any' && b.color === 'any' ? randomInt(2) === 1 : a.color === 'black' || b.color === 'white', [w, k] = swap ? [b, a] : [a, b];
    const { m, tokens } = blank(owner, [w, k].map((x) => ({ kind: x.kind, level: 0 })));
    claim(m, 0, w.entry, w.name ?? undefined);
    claim(m, 1, k.entry, k.name ?? undefined);
    persist(m);
    return { m, tokens, mine: w === b ? 0 : 1 };
  }

  function ticket(q: Waiting): QueueRes {
    const base = { ticket: '', expires: new Date(q.created + CHESS.queueMs).toISOString() };
    if (!q.ready) return { ...base, status: 'waiting', ...(q.fallback && { fallback: new Date(q.fallback.at).toISOString() }) };
    return { ...base, status: 'matched', color: q.ready.color, match: { match: view(find(q.ready.id), COLORS.indexOf(q.ready.color)), seats: [], token: q.ready.token } };
  }

  function enter(entry: Entry | null, owner: string, b: Record<string, unknown>): QueueRes {
    const color = b.color === undefined ? 'any' : pick<Color | 'any'>(b.color, ['white', 'black', 'any'], 'color'), kind: SeatKind = entry?.kind === 'ai' ? 'agent' : 'human', display = label24(b.name);
    const f = b.computer === undefined ? null : typeof b.computer === 'object' && b.computer !== null ? (b.computer as Record<string, unknown>) : bad('computer', 'must be {level, after}');
    const level = f ? (Number.isInteger(f.level) && (f.level as number) >= 1 && (f.level as number) <= 5 ? (f.level as number) : bad('computer.level', 'must be 1 to 5')) : 0;
    const after = f ? (Number.isInteger(f.after) && (f.after as number) >= 5 && (f.after as number) <= CHESS.queueMs / 1000 ? (f.after as number) : bad('computer.after', `must be 5 to ${CHESS.queueMs / 1000} seconds`)) : 0;
    purge();
    const again = entry && queue.find((q) => q.entry?.id === entry.id);
    if (again) return { ...ticket(queued(undefined, entry)), ticket: '' };
    queues(owner);
    const secret = rid(24), t = now(), me: Waiting = { hash: sha256(secret), entry, kind, color, name: display ?? null, created: t, fallback: f ? { level, at: t + after * 1000 } : null };
    const mate = queue.find((q) => !q.ready && fits(q.color, color) && (!entry || q.entry?.id !== entry.id));
    if (!mate) { queue.push(me); return { ...ticket(me), ticket: secret }; }
    const { m, tokens, mine } = pair(mate, me, owner);
    mate.ready = { id: m.id, token: tokens[1 - mine], color: COLORS[1 - mine] };
    me.ready = { id: m.id, token: tokens[mine], color: COLORS[mine] };
    return { ...ticket(me), ticket: secret };
  }

  function purge() {
    for (let i = queue.length - 1; i >= 0; i--) { const r = queue[i].ready, m = r && matches.get(r.id); if (r && (!m || m.res !== null)) queue.splice(i, 1); }
  }

  function queued(secret: unknown, entry: Entry | null): Waiting {
    purge();
    const h = typeof secret === 'string' && SEAT.test(secret) ? sha256(secret) : '', q = h ? queue.find((x) => x.hash === h) : entry ? queue.find((x) => x.entry?.id === entry.id) : undefined;
    if (!q) throw new Fail(404, 'unknown or expired queue ticket');
    if (!q.ready && q.fallback && now() >= q.fallback.at) {
      const mine = q.color === 'black' ? 1 : q.color === 'white' ? 0 : randomInt(2), kinds = [{ kind: q.kind, level: 0 }, { kind: 'computer' as const, level: q.fallback.level }];
      const { m, tokens } = blank(q.entry?.id ?? `q:${q.hash.slice(0, 12)}`, mine ? kinds.reverse() : kinds);
      claim(m, mine, q.entry, q.name ?? undefined);
      persist(m);
      q.ready = { id: m.id, token: tokens[mine], color: COLORS[mine] };
    }
    return q;
  }

  const status = (secret: unknown, entry: Entry | null): QueueRes => ({ ...ticket(queued(secret, entry)), ticket: typeof secret === 'string' ? secret : '' });
  const leave = (secret: unknown, entry: Entry | null) => { queue.splice(queue.indexOf(queued(secret, entry)), 1); };

  function wait(id: string, ms: number): Promise<void> {
    const m = find(id);
    return new Promise((resolve) => {
      const done = () => { m.subs.delete(sub); clearTimeout(t); resolve(); }, sub = () => done(), t = setTimeout(done, ms).unref();
      m.subs.add(sub);
    });
  }

  function sweep() {
    const t = now();
    for (const [id, m] of matches) {
      if (m.end) { if (t - m.end.at > WATCH_MS) { matches.delete(id); watches.delete(m.watch); } continue; }
      if (m.res !== null) continue;
      if (!m.seat.every((s) => s.joined)) { if (t - m.created > CHESS.openMs) { matches.delete(id); watches.delete(m.watch); db.run('DELETE FROM chess_live WHERE id = ?', id); } continue; }
      if (t - m.moved > CHESS.moveMs) { const i = turn(m); if (m.seat[i].kind === 'computer') m.moved = t; else end(m, i ? 1 : 0, 'timeout'); }
    }
    purge();
    for (let i = queue.length - 1; i >= 0; i--) if (t - queue[i].created > CHESS.queueMs) queue.splice(i, 1);
  }

  function restore() {
    let n = 0;
    for (const { id, data } of db.all<{ id: string; data: string }>('SELECT id, data FROM chess_live')) {
      try {
        const d = JSON.parse(data), m: M = { id, watch: d.watch, owner: d.owner, seed: d.seed, fen: START, reps: Pos.fen(START).hist, moves: [], sans: d.sans, grades: d.grades, res: null, why: '', draw: d.draw, created: d.created, moved: d.moved, subs: new Set(), pending: new Set(), busy: false,
          seat: d.seat.map((s: Seat & { entry: string | null }) => ({ ...s, entry: s.entry === null ? null : db.get<Entry>('SELECT * FROM entries WHERE id = ?', s.entry) ?? null })) };
        const p = Pos.fen(START);
        for (const mv of d.moves) { p.make(parse(p, mv)); m.moves.push(mv); }
        m.fen = p.fen(); m.reps = p.hist.slice(-2 * (p.half + 1));
        matches.set(id, m); watches.set(m.watch, m);
        const e = ending(p);
        if (e) end(m, e.win < 0 ? 0.5 : e.win === 0 ? 1 : 0, e.why); else drive(m);
        n++;
      } catch (e) { logError(e, { restore: id }); db.run('DELETE FROM chess_live WHERE id = ?', id); }
    }
    if (n) log('restored', { matches: n });
  }
  restore();

  const watch = (id: string) => { const m = watches.get(id); return m && { frame: () => frame(m), actions: () => [...m.moves], sub: (f: Sub) => { m.subs.add(f); return () => m.subs.delete(f); } }; };
  const list = (): LiveSession[] => [...watches.values()].filter((m) => m.res === null && m.seat.every((s) => s.joined)).reverse().slice(0, 50).map((m) => ({ watch: m.watch, game: 'chess', seedCode: '', mode: 'match', entry: null, step: m.moves.length, score: 0, startedAt: new Date(m.created).toISOString(), match: { white: info(m.seat[0]).name ?? '', black: info(m.seat[1]).name ?? '' } }));

  function ratings(viewer: string | undefined): ChessBoard {
    const rows = db.all<Rating & { entry: string; name: string; x: string; kind: 'ai' | 'human'; agent_type: string | null; listing: string }>(
      "SELECT r.*, e.name, e.x, e.kind, e.listing FROM ratings r JOIN entries e ON e.id = r.entry WHERE e.listing = 'listed' OR e.id = ? ORDER BY r.elo DESC LIMIT 200", viewer ?? '');
    return {
      updatedAt: new Date(now()).toISOString(),
      rows: [
        ...LEVELS.map((l, i) => ({ entryId: `computer-${i + 1}`, name: `Computer level ${i + 1}`, badge: 'official' as const, kind: 'computer' as const, elo: l.elo, provisional: false, games: 0, wins: 0, draws: 0, losses: 0, accuracy: null, blunders: 0 })),
        ...rows.map((r) => ({ entryId: r.entry, name: r.kind === 'human' ? `@${r.x}` : r.name, ...(r.kind === 'ai' && { x: r.x }), badge: 'registered' as const, kind: r.kind, elo: Math.round(r.elo), provisional: r.games < CHESS.provisional, games: r.games, wins: r.wins, draws: r.draws, losses: r.losses, accuracy: r.accn ? r.acc / r.accn : null, blunders: r.blunders })),
      ].sort((a, b) => b.elo - a.elo),
    };
  }

  return {
    create, join, get, move, resign, offer, enter, status, leave, wait, sweep, watch, list, ratings,
    get open() { let n = 0; for (const m of matches.values()) n += +(m.res === null); return n; },
    get waiting() { return queue.filter((q) => !q.ready).length; },
  };
}
export type Matches = ReturnType<typeof makeMatches>;
