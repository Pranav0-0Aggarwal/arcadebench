import { LIMITS, type Track } from '@arcadebench/api';
import { GAMES, PAPER_CAPS, parseSeedCode, type HelpLevel } from '@arcadebench/engine';
import type { Clock } from '@arcadebench/eval';
import { Session } from '@arcadebench/mcp';
import { randomInt } from 'node:crypto';
import type { Db, Entry } from './db.ts';
import type { SaveRun } from './runs.ts';
import { HALF_WIDTH, MIN_SEEDS, REPEATS, SEEDS, type Seasons } from './seasons.ts';
import { bad, pick } from './validate.ts';
import { Fail, logError, rid } from './util.ts';

export const TTL_MS = 30 * 60 * 1000;

interface Live { s: Session; owner: string; entry: Entry | null; ranked: boolean; season: string; track: Track; touched: number }
interface Deps { db: Db; save: SaveRun; seasons: Seasons; now: () => number }

export function makeSessions({ db, save, seasons, now }: Deps) {
  const live = new Map<string, Live>();

  function finish(l: Live) {
    if (l.s.written) return;
    l.s.written = true;
    if (!l.ranked && !l.s.steps) return;
    const e = l.s.episode(true);
    save({ entry: l.entry?.id ?? null, season: l.season, game: e.game, seed: e.seed, repeat: e.repeat, track: l.track, help: e.help, cap: e.cap, ranked: l.ranked, score: e.score, steps: e.steps, truncated: e.truncated, decisions: e.decisions, actions: e.actions })
      .norm.catch(logError);
  }

  function precise(entry: string, season: string, game: string) {
    const v = db.all<{ norm: number }>('SELECT norm FROM runs WHERE entry = ? AND season = ? AND game = ? AND ranked = 1 AND repeat = 0 AND norm IS NOT NULL', entry, season, game).map((r) => r.norm);
    if (v.length < MIN_SEEDS) return false;
    const m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
    return 1.96 * sd / Math.sqrt(v.length) <= HALF_WIDTH;
  }

  function ranked(entry: Entry | null, game: string, helpReq: unknown) {
    if (!entry) throw new Fail(401, 'ranked sessions need your link token');
    if (entry.kind !== 'ai' || entry.mode !== 'tool') throw new Fail(403, 'ranked sessions are for AI entries in tool mode');
    if (helpReq !== undefined && helpReq !== entry.help) throw new Fail(400, `help: ranked sessions use the entry's help level (${entry.help})`);
    const season = seasons.current();
    let done = db.get<{ n: number }>('SELECT n FROM quota WHERE entry = ? AND season = ? AND game = ?', entry.id, season.id, game)?.n ?? 0;
    if (done < SEEDS && precise(entry.id, season.id, game)) done = SEEDS;
    if (done >= SEEDS + REPEATS) throw new Fail(409, `no ${game} seeds left this season`);
    db.run('INSERT INTO quota (entry, season, game, n) VALUES (?, ?, ?, ?) ON CONFLICT (entry, season, game) DO UPDATE SET n = excluded.n', entry.id, season.id, game, done + 1);
    return { season: season.id, seed: season.seeds[game][done % SEEDS], repeat: +(done >= SEEDS), help: entry.help };
  }

  function practice(entry: Entry | null, game: string, b: Record<string, unknown>) {
    const code = b.seedCode === undefined ? null : parseSeedCode(String(b.seedCode));
    if (b.seedCode !== undefined && (!code || code.game !== game)) bad('seedCode', `not a valid ${game} seed code`);
    const seed = code ? code.seed : b.seed === undefined ? randomInt(2 ** 32) : Number.isInteger(b.seed) && (b.seed as number) >= 0 && (b.seed as number) < 2 ** 32 ? (b.seed as number) : bad('seed', 'must be an integer from 0 to 4294967295');
    return { season: seasons.current().id, seed, repeat: 0, help: pick<HelpLevel>(b.help, [0, 1, 2], 'help', entry?.help ?? 1) };
  }

  function start(entry: Entry | null, owner: string, b: Record<string, unknown>): Session {
    const game = typeof b.game === 'string' && GAMES[b.game] ? b.game : bad('game', 'unknown game');
    const mode = pick<'practice' | 'ranked'>(b.mode, ['practice', 'ranked'], 'mode');
    const g = GAMES[game], rt = g.realtime;
    const clock = pick<Clock>(b.clock, ['none', 'latency', 'token'], 'clock', rt ? 'latency' : 'none');
    if (mode === 'ranked' && rt && clock === 'none') bad('clock', 'ranked real-time games need the latency or token clock');
    if ([...live.values()].filter((l) => l.owner === owner && !l.s.written).length >= LIMITS.maxOpenSessionsPerToken) throw new Fail(429, 'too many open sessions; finish one first');
    const run = mode === 'ranked' ? ranked(entry, game, b.help) : practice(entry, game, b);
    const s = new Session(rid(16), game, run.seed, { help: run.help, cap: PAPER_CAPS[game], clock: rt ? clock : 'none', repeat: run.repeat, hide: mode === 'ranked' }, { agent: entry?.name ?? 'anonymous', harness: 'api', settings: { transport: 'http' } });
    const l: Live = { s, owner, entry, ranked: mode === 'ranked', season: run.season, track: rt && clock !== 'none' ? clock : 'turn', touched: now() };
    live.set(s.id, l);
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
    sweep(all = false) {
      for (const [id, l] of live) if (all || now() - l.touched > TTL_MS) { finish(l); live.delete(id); }
    },
  };
}
export type Sessions = ReturnType<typeof makeSessions>;
