import { BASE_PATH, LIMITS, type LiveFrame, type LiveSession, type RunMode, type Track } from '@arcadebench/api';
import { GAMES, PAPER_CAPS, parseSeedCode, seedCodeOf, type HelpLevel } from '@arcadebench/engine';
import type { Clock, Decision } from '@arcadebench/eval';
import { Session } from '@arcadebench/mcp';
import { sd } from '@arcadebench/stats';
import { randomInt } from 'node:crypto';
import type { Db, Entry } from './db.ts';
import type { Refs } from './refs.ts';
import type { SaveRun } from './runs.ts';
import { bad, pick } from './validate.ts';
import { Fail, logError, rid } from './util.ts';

export const TTL_MS = 30 * 60 * 1000, WATCH_MS = 10 * 60 * 1000;
const MIN = 10, MAX = 30, REPEATS = 3, HALF = 0.05, TAIL = 600, LISTED = 50, GONE = 5000, IDLE = 120_000;

type Sub = (f: LiveFrame) => void;
interface Live { s: Session; owner: string; entry: Entry | null; bench: boolean; track: Track; touched: number; watch: string; subs: Set<Sub>; end?: { at: number; frame: LiveFrame } }
interface Deps { db: Db; save: SaveRun; refs: Refs; origin: string; now: () => number }

const tight = (v: number[]) => v.length >= MIN && 1.96 * sd(v) / Math.sqrt(v.length) <= HALF;

export function makeSessions({ db, save, refs, origin, now }: Deps) {
  const live = new Map<string, Live>(), watches = new Map<string, Live>(), gone = new Map<string, string>();

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
    return { ...info(l), done: false, data: l.s.g.data(l.s.s), last: d ? { step: d.step, action: d.action, expert: d.expert, regret: d.regret, agree: d.agree, invalid: d.invalid } : null, regrets: ds.map((x) => x.regret) };
  }

  function finish(l: Live) {
    if (l.s.written) return;
    l.s.written = true;
    let runId: string | undefined;
    if (l.bench || l.s.steps) {
      const e = l.s.episode(true), r = save({ entry: l.entry?.id ?? null, game: e.game, seed: e.seed, repeat: e.repeat, track: l.track, help: e.help, cap: e.cap, bench: l.bench, score: e.score, steps: e.steps, truncated: e.truncated, decisions: e.decisions, actions: e.actions });
      r.norm.catch(logError);
      runId = r.id;
    }
    const last = { ...frame(l), done: true, ...(runId && { runId }) };
    l.end = { at: now(), frame: last };
    for (const f of l.subs) f(last);
  }

  function plan(entry: Entry, game: string) {
    const runs = [
      ...db.all<{ seed: number; repeat: number; norm: number | null }>('SELECT seed, repeat, norm FROM runs WHERE entry = ? AND game = ? AND bench = 1 ORDER BY n', entry.id, game),
      ...[...live.values()].filter((l) => l.entry?.id === entry.id && l.bench && l.s.game === game && !l.s.written).map((l) => ({ seed: l.s.seed, repeat: l.s.o.repeat, norm: null })),
    ];
    const firsts = runs.filter((r) => !r.repeat), repeats = runs.length - firsts.length;
    if (!repeats && firsts.length < MAX && !tight(firsts.flatMap((r) => (r.norm === null ? [] : [r.norm])))) return { seed: randomInt(0, 2 ** 31), repeat: 0 };
    if (repeats >= REPEATS) throw new Fail(409, `benchmark complete for ${game}`);
    return { seed: firsts[repeats].seed, repeat: 1 };
  }

  function bench(entry: Entry | null, game: string, helpReq: unknown) {
    if (!entry) throw new Fail(401, 'benchmark sessions need your link token');
    if (entry.kind !== 'ai' || entry.mode !== 'tool') throw new Fail(403, 'benchmark sessions are for AI entries in tool mode');
    if (helpReq !== undefined && helpReq !== entry.help) throw new Fail(400, `help: benchmark sessions use the entry's help level (${entry.help})`);
    const run = plan(entry, game);
    if (!run.repeat) refs.get(game, run.seed, PAPER_CAPS[game]).catch(logError);
    return { ...run, help: entry.help };
  }

  function practice(entry: Entry | null, game: string, b: Record<string, unknown>) {
    const code = b.seedCode === undefined ? null : parseSeedCode(String(b.seedCode));
    if (b.seedCode !== undefined && (!code || code.game !== game)) bad('seedCode', `not a valid ${game} seed code`);
    const seed = code ? code.seed : b.seed === undefined ? randomInt(2 ** 32) : Number.isInteger(b.seed) && (b.seed as number) >= 0 && (b.seed as number) < 2 ** 32 ? (b.seed as number) : bad('seed', 'must be an integer from 0 to 4294967295');
    return { seed, repeat: 0, help: pick<HelpLevel>(b.help, [0, 1, 2], 'help', entry?.help ?? 1) };
  }

  function start(entry: Entry | null, owner: string, b: Record<string, unknown>): Session {
    const game = typeof b.game === 'string' && GAMES[b.game] ? b.game : bad('game', 'unknown game');
    const isBench = pick<RunMode | 'ranked'>(b.mode, ['practice', 'benchmark', 'ranked'], 'mode') !== 'practice';
    const g = GAMES[game], rt = g.realtime;
    const clock = pick<Clock>(b.clock, ['none', 'latency', 'token'], 'clock', rt ? 'latency' : 'none');
    if (isBench && rt && clock === 'none') bad('clock', 'benchmark real-time games need the latency or token clock');
    if ([...live.values()].filter((l) => l.owner === owner && !l.s.written).length >= LIMITS.maxOpenSessionsPerToken) throw new Fail(429, 'too many open sessions; finish one first');
    const run = isBench ? bench(entry, game, b.help) : practice(entry, game, b), watch = rid(12);
    const s = new Session(rid(16), game, run.seed, { help: run.help, cap: PAPER_CAPS[game], clock: rt ? clock : 'none', repeat: run.repeat, watch, watchUrl: `${origin}${BASE_PATH}/watch/${watch}` }, { agent: entry?.name ?? 'anonymous', harness: 'api', settings: { transport: 'http' } });
    const l: Live = { s, owner, entry, bench: isBench, track: rt && clock !== 'none' ? clock : 'turn', touched: now(), watch, subs: new Set() };
    s.onStep = () => { if (l.subs.size) { const f = frame(l); for (const sub of l.subs) sub(f); } };
    live.set(s.id, l);
    watches.set(watch, l);
    if (s.done) finish(l);
    return s;
  }

  function find(viewer: Entry | null, id: string) {
    const l = live.get(id);
    if (!l || (l.entry && l.entry.id !== viewer?.id)) throw new Fail(404, 'unknown or expired session');
    l.touched = now();
    return l;
  }

  return {
    start,
    get: (viewer: Entry | null, id: string) => find(viewer, id).s,
    move(viewer: Entry | null, id: string, action: unknown, tokensOut: unknown) {
      const l = find(viewer, id);
      if (typeof action !== 'string' || action.length > 64) bad('action', 'must be a string');
      if (tokensOut !== undefined && !(Number.isInteger(tokensOut) && (tokensOut as number) >= 0 && (tokensOut as number) <= 1e7)) bad('tokensOut', 'must be a non-negative integer');
      if (l.s.done) throw new Fail(409, 'the game is over');
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
    gone: (id: string) => (gone.has(id) ? { runId: gone.get(id) } : {}),
    sweep(all = false) {
      for (const [id, l] of live) if (all || now() - l.touched > TTL_MS) { finish(l); live.delete(id); }
      for (const [w, l] of watches) {
        if (!l.end || (!all && now() - l.end.at <= WATCH_MS)) continue;
        watches.delete(w);
        if (l.end.frame.runId) gone.set(w, l.end.frame.runId);
        if (gone.size > GONE) gone.delete(gone.keys().next().value!);
      }
    },
  };
}
export type Sessions = ReturnType<typeof makeSessions>;
