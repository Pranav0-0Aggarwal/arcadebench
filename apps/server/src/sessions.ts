import { BASE_PATH, LIMITS, type LiveFrame, type LiveSession, type RunMode, type Track } from '@arcadebench/api';
import { GAMES, PAPER_CAPS, parseSeedCode, seedCodeOf, type HelpLevel } from '@arcadebench/engine';
import type { Clock, Decision } from '@arcadebench/eval';
import { Session } from '@arcadebench/mcp';
import { sd } from '@arcadebench/stats';
import { randomInt } from 'node:crypto';
import type { Db, Entry } from './db.ts';
import { limiter } from './limit.ts';
import type { Refs } from './refs.ts';
import type { SaveRun } from './runs.ts';
import { bad, pick } from './validate.ts';
import { Fail, log, logError, major, median, quiet, rid } from './util.ts';

export const TTL_MS = 30 * 60 * 1000, WATCH_MS = 10 * 60 * 1000, MAX_OPEN = 400, KEEP = 2000, STARTS_PER_HOUR = 600;
const MIN = 10, MAX = 30, REPEATS = 3, HALF = 0.05, TAIL = 600, LISTED = 50, IDLE = 120_000;

type Sub = (f: LiveFrame) => void;
interface Live { s: Session; owner: string; entry: Entry | null; bench: boolean; track: Track; touched: number; watch: string; subs: Set<Sub>; end?: { at: number; frame: LiveFrame }; restored?: boolean }
interface Deps { db: Db; save: SaveRun; refs: Refs; origin: string; now: () => number }

const tight = (v: number[]) => v.length >= MIN && 1.96 * sd(v) / Math.sqrt(v.length) <= HALF;

export function makeSessions({ db, save, refs, origin, now }: Deps) {
  const live = new Map<string, Live>(), watches = new Map<string, Live>();
  const starts = limiter(STARTS_PER_HOUR, 3600_000, now, 'too many games started; try again later');
  let saved = -Infinity;

  const info = (l: Live) => ({
    watch: l.watch, game: l.s.game, seedCode: seedCodeOf(l.s.game, l.s.seed), mode: (l.bench ? 'benchmark' : 'practice') as RunMode,
    entry: l.entry?.listing === 'listed' ? { name: l.entry.name, x: l.entry.x } : null, step: l.s.steps, score: l.s.g.score(l.s.s),
  });

  function frame(l: Live): LiveFrame {
    if (l.end) return l.end.frame;
    const ds: Decision[] = [];
    for (let i = l.s.decisions.length - 1; i >= 0 && ds.length < TAIL; i--) if (!l.s.decisions[i].forced) ds.push(l.s.decisions[i]);
    ds.reverse();
    const d = ds.at(-1);
    return { ...info(l), done: false, data: l.s.g.data(l.s.s), last: d ? { step: d.step, action: d.action, expert: d.expert, regret: d.regret, agree: d.agree, invalid: d.invalid, latencyMs: d.latencyMs } : null, regrets: ds.map((x) => x.regret), medianMs: median(ds.flatMap((x) => (x.latencyMs === undefined ? [] : [x.latencyMs]))) };
  }

  function finish(l: Live) {
    if (l.s.written) return;
    l.s.written = true;
    let runId: string | undefined;
    if (l.bench || l.s.steps) {
      const e = l.s.episode(true), r = save({ entry: l.entry?.id ?? null, game: e.game, seed: e.seed, repeat: e.repeat, track: l.track, help: e.help, cap: e.cap, bench: l.bench, score: e.score, steps: e.steps, truncated: e.truncated, decisions: e.decisions, actions: e.actions, watch: l.watch });
      r.norm.catch(quiet);
      runId = r.id;
    }
    const last = { ...frame(l), done: true, ...(runId && { runId }) };
    l.end = { at: now(), frame: last };
    l.s.decisions = [];
    db.run('DELETE FROM live WHERE id = ?', l.s.id);
    for (const f of l.subs) f(last);
  }

  function plan(entry: Entry, game: string, track: Track) {
    const runs = [
      ...db.all<{ seed: number; repeat: number; norm: number | null }>("SELECT seed, repeat, norm FROM runs WHERE entry = ? AND game = ? AND track = ? AND bench = 1 AND substr(version, 1, instr(version || '.', '.') - 1) = ? AND cap = ? ORDER BY n", entry.id, game, track, major(GAMES[game].version), PAPER_CAPS[game]),
      ...[...live.values()].filter((l) => l.entry?.id === entry.id && l.bench && l.s.game === game && l.track === track && !l.end).map((l) => ({ seed: l.s.seed, repeat: l.s.o.repeat, norm: null })),
    ];
    const firsts = runs.filter((r) => !r.repeat), repeats = runs.length - firsts.length;
    if (!repeats && firsts.length < MAX && !tight(firsts.flatMap((r) => (r.norm === null ? [] : [r.norm])))) return { seed: randomInt(0, 2 ** 31), repeat: 0 };
    if (repeats >= REPEATS) throw new Fail(409, `benchmark complete for ${game}`);
    return { seed: firsts[repeats].seed, repeat: 1 };
  }

  function bench(entry: Entry | null, game: string, track: Track, helpReq: unknown) {
    if (!entry) throw new Fail(401, 'benchmark sessions need your link token');
    if (entry.kind !== 'ai' || entry.mode !== 'tool') throw new Fail(403, 'benchmark sessions are for AI entries in tool mode');
    if (helpReq !== undefined && helpReq !== entry.help) throw new Fail(400, `help: benchmark sessions use the entry's help level (${entry.help})`);
    const run = plan(entry, game, track);
    if (!run.repeat) refs.get(game, run.seed, PAPER_CAPS[game]).catch(quiet);
    return { ...run, help: entry.help };
  }

  function practice(entry: Entry | null, game: string, b: Record<string, unknown>) {
    const code = b.seedCode === undefined ? null : parseSeedCode(String(b.seedCode));
    if (b.seedCode !== undefined && (!code || code.game !== game)) bad('seedCode', `not a valid ${game} seed code`);
    const seed = code ? code.seed : b.seed === undefined ? randomInt(2 ** 32) : Number.isInteger(b.seed) && (b.seed as number) >= 0 && (b.seed as number) < 2 ** 32 ? (b.seed as number) : bad('seed', 'must be an integer from 0 to 4294967295');
    return { seed, repeat: 0, help: pick<HelpLevel>(b.help, [0, 1, 2], 'help', entry?.help ?? 1) };
  }

  function add(l: Live) {
    l.s.onStep = () => { if (l.subs.size) { const f = frame(l); for (const sub of l.subs) sub(f); } };
    live.set(l.s.id, l);
    watches.set(l.watch, l);
    if (l.s.done) finish(l);
  }

  function start(entry: Entry | null, owner: string, b: Record<string, unknown>): Session {
    const game = typeof b.game === 'string' && GAMES[b.game] ? b.game : bad('game', 'unknown game');
    const isBench = pick<RunMode | 'ranked'>(b.mode, ['practice', 'benchmark', 'ranked'], 'mode') !== 'practice';
    const rt = GAMES[game].realtime, clock = pick<Clock>(b.clock, ['none', 'latency', 'token'], 'clock', rt ? 'latency' : 'none'), tr: Track = rt && clock !== 'none' ? clock : 'turn';
    if (isBench && rt && clock === 'none') bad('clock', 'benchmark real-time games need the latency or token clock');
    let open = 0, mine = 0;
    for (const l of live.values()) if (!l.end) { open++; if (l.owner === owner) mine++; }
    if (mine >= LIMITS.maxOpenSessionsPerToken) throw new Fail(429, 'too many open sessions; finish one first', 60);
    if (open >= MAX_OPEN) throw new Fail(503, 'server is at capacity; try again shortly', 30);
    starts(owner);
    const run = isBench ? bench(entry, game, tr, b.help) : practice(entry, game, b), watch = rid(12);
    for (const [w, l] of watches) { if (watches.size < KEEP) break; if (l.end) { watches.delete(w); live.delete(l.s.id); } }
    const s = new Session(rid(16), game, run.seed, { help: run.help, cap: PAPER_CAPS[game], clock: rt ? clock : 'none', repeat: run.repeat, watch, watchUrl: `${origin}${BASE_PATH}/watch/${watch}` }, { agent: entry?.name ?? 'anonymous', harness: 'api', settings: { transport: 'http' } });
    add({ s, owner, entry, bench: isBench, track: tr, touched: now(), watch, subs: new Set() });
    return s;
  }

  function find(viewer: Entry | null, id: string) {
    const l = live.get(id);
    if (!l || (l.entry && l.entry.id !== viewer?.id)) throw new Fail(404, 'unknown or expired session');
    l.touched = now();
    return l;
  }

  function persist(all = false) {
    const t = now();
    db.tx(() => {
      for (const l of live.values()) if (!l.end && (all || l.touched >= saved)) {
        const { s } = l;
        db.run('INSERT OR REPLACE INTO live (id, data) VALUES (?, ?)', s.id, JSON.stringify({
          owner: l.owner, entry: l.entry?.id ?? null, bench: l.bench, track: l.track, watch: l.watch, touched: l.touched,
          game: s.game, version: s.g.version, seed: s.seed, o: s.o, meta: s.meta, actions: s.actions, decisions: s.decisions, invalid: s.invalid, misses: s.misses, tries: s.tries, started: s.started,
        }));
      }
    });
    saved = t;
  }

  function restore() {
    let n = 0;
    for (const { id, data } of db.all<{ id: string; data: string }>('SELECT id, data FROM live')) {
      try {
        const d = JSON.parse(data), entry = d.entry === null ? null : db.get<Entry>('SELECT * FROM entries WHERE id = ?', d.entry);
        if (GAMES[d.game]?.version !== d.version || (d.entry !== null && !entry)) throw new Error('game version or entry changed');
        const s = new Session(id, d.game, d.seed, d.o, d.meta);
        s.s = s.g.init(d.seed);
        for (const a of d.actions) s.s = s.g.step(s.s, a);
        Object.assign(s, { actions: d.actions, steps: d.actions.length, decisions: d.decisions, invalid: d.invalid, misses: d.misses, tries: d.tries, started: d.started });
        add({ s, owner: d.owner, entry: entry ?? null, bench: d.bench, track: d.track, touched: d.touched, watch: d.watch, subs: new Set(), restored: true });
        n++;
      } catch (e) { logError(e, { restore: id }); db.run('DELETE FROM live WHERE id = ?', id); }
    }
    if (n) log('restored', { sessions: n });
  }

  restore();

  return {
    start,
    get: (viewer: Entry | null, id: string) => find(viewer, id).s,
    move(viewer: Entry | null, id: string, action: unknown, tokensOut: unknown, step?: unknown) {
      const l = find(viewer, id);
      if (typeof action !== 'string' || action.length > 64) bad('action', 'must be a string');
      if (tokensOut !== undefined && !(Number.isInteger(tokensOut) && (tokensOut as number) >= 0 && (tokensOut as number) <= 1e7)) bad('tokensOut', 'must be a non-negative integer');
      if (step !== undefined && !(Number.isInteger(step) && (step as number) >= 0)) bad('step', 'must be a non-negative integer');
      if (step !== undefined && step !== l.s.steps) return { s: l.s, invalid: null };
      if (l.s.done) throw new Fail(409, 'the game is over');
      if (l.restored) { l.restored = false; l.s.lastReply = performance.now(); }
      const invalid = l.s.move(action as string, tokensOut as number | undefined);
      if (l.s.done) finish(l);
      return { s: l.s, invalid };
    },
    list: (): LiveSession[] => [...watches.values()].filter((l) => !l.end && now() - l.touched < IDLE).reverse().slice(0, LISTED).map((l) => {
      const { watch, game, seedCode, mode, entry, step, score } = info(l);
      return { watch, game, seedCode, mode, entry, step, score, startedAt: new Date(l.s.started).toISOString() };
    }),
    watch(id: string) {
      const l = watches.get(id);
      return l && { frame: () => frame(l), actions: () => [...l.s.actions], sub: (f: Sub) => { l.subs.add(f); return () => l.subs.delete(f); } };
    },
    gone: (id: string) => { const r = db.get<{ id: string }>('SELECT id FROM runs WHERE watch = ?', id); return r ? { runId: r.id } : {}; },
    sweep() {
      const t = now();
      for (const [id, l] of live) if (l.end ? t - l.end.at > WATCH_MS : t - l.touched > TTL_MS) { finish(l); live.delete(id); }
      for (const [w, l] of watches) if (l.end && t - l.end.at > WATCH_MS) watches.delete(w);
      persist();
    },
    persist,
    get open() { let n = 0; for (const l of live.values()) n += +!l.end; return n; },
  };
}
export type Sessions = ReturnType<typeof makeSessions>;
