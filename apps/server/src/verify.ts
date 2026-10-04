import type { VerifyRes } from '@arcadebench/api';
import { GAMES, CAPS, parseSeedCode } from '@arcadebench/engine';
import type { Db, Entry } from './db.ts';
import type { Refs } from './refs.ts';
import type { SaveRun } from './runs.ts';
import { bad, pick } from './validate.ts';
import { Fail } from './util.ts';
import type { Pool } from './work.ts';

interface Deps { db: Db; refs: Refs; save: SaveRun; pool: Pool }

export function makeVerify({ db, refs, save, pool }: Deps) {
  return async (b: Record<string, unknown>, entry: Entry | null): Promise<VerifyRes> => {
    const game = typeof b.game === 'string' && GAMES[b.game] ? b.game : bad('game', 'unknown game');
    const code = parseSeedCode(String(b.seedCode));
    if (!code || code.game !== game) bad('seedCode', `not a valid ${game} seed code`);
    const cap = CAPS[game];
    const chosen = Array.isArray(b.actions) && b.actions.length <= cap && b.actions.every((a) => typeof a === 'string') ? (b.actions as string[]) : bad('actions', `must be a list of up to ${cap} action ids`);
    const as = pick(b.as, ['human', 'agent'], 'as', 'human');
    if (as === 'agent' && !entry) throw new Fail(401, 'agent runs need the link token of a computer-use entry');
    if (as === 'agent' && !(entry!.kind === 'ai' && entry!.mode === 'computer-use')) throw new Fail(403, 'agent runs need a computer-use entry');
    const { seed } = code!;
    const r = await pool.run('replay', game, seed, chosen, cap);
    if ('error' in r) throw new Fail(422, `illegal action log: ${r.error}`);
    const ref = await refs.get(game, seed, cap);
    const run = save({ entry: as === 'agent' || entry?.kind === 'human' ? entry!.id : null, game, seed, repeat: 0, track: as === 'agent' ? 'computer-use' : 'human', help: 0, cap, bench: false, score: r.score, steps: r.steps, truncated: !r.done, decisions: r.decisions, actions: r.actions });
    const normalized = await run.norm;
    const models = db.all<{ name: string; score: number }>(
      `SELECT e.name, r.score, MIN(r.n) FROM runs r JOIN entries e ON e.id = r.entry
       WHERE r.game = ? AND r.seed = ? AND e.kind = 'ai' AND e.listing = 'listed' AND r.track IN ('turn', 'latency', 'token')
       GROUP BY r.entry ORDER BY r.score DESC LIMIT 20`, game, seed);
    return { runId: run.id, score: r.score, normalized, compare: [{ name: 'expert', score: ref.expert }, { name: 'random', score: ref.random }, ...models.map((m) => ({ name: m.name, score: m.score }))] };
  };
}
