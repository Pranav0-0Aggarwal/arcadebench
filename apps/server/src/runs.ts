import { deflateSync } from 'node:zlib';
import type { Track } from '@arcadebench/api';
import { GAMES, type HelpLevel } from '@arcadebench/engine';
import type { Decision } from '@arcadebench/eval';
import { normalize } from '@arcadebench/stats';
import type { Db } from './db.ts';
import type { Refs } from './refs.ts';
import { median, quiet, rid } from './util.ts';

export interface RunIn {
  entry: string | null; game: string; seed: number; repeat: number; track: Track; help: HelpLevel; cap: number; bench: boolean;
  score: number; steps: number; truncated: boolean; decisions: Decision[]; actions: string[]; watch?: string;
}
type Scored = Pick<RunIn, 'game' | 'seed' | 'cap' | 'score'>;

export function makeRuns(db: Db, refs: Refs, changed: () => void) {
  const score = (id: string, r: Scored) => refs.get(r.game, r.seed, r.cap).then((ref) => {
    const n = normalize({ game: r.game, seed: r.seed, agent: r.score, ...ref });
    db.run('UPDATE runs SET norm = ? WHERE id = ?', n, id);
    changed();
    return n;
  });
  const insert = (r: RunIn, extra: object = {}) => {
    const id = rid(), real = r.decisions.filter((d) => !d.forced);
    db.run(
      'INSERT INTO runs (id, entry, game, version, seed, repeat, track, help, cap, bench, score, steps, agree, dec, truncated, created, ep, lat, watch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, r.entry, r.game, GAMES[r.game].version, r.seed, r.repeat, r.track, r.help, r.cap, +r.bench, r.score, r.steps, real.filter((d) => d.agree).length, real.length, +r.truncated,
      new Date().toISOString(), deflateSync(JSON.stringify({ actions: r.actions, decisions: r.decisions, ...extra })), median(real.flatMap((d) => (d.latencyMs === undefined ? [] : [d.latencyMs]))), r.watch ?? null,
    );
    return id;
  };
  const save = (r: RunIn) => { const id = insert(r); return { id, norm: score(id, r) }; };
  const saveMatch = (r: RunIn, match: object) => insert(r, { match });
  const backfill = () => {
    for (const r of db.all<Scored & { id: string; version: string }>(
      `SELECT r.id, r.game, r.version, r.seed, r.cap, r.score FROM runs r LEFT JOIN refs f ON f.game = r.game AND f.version = r.version AND f.seed = r.seed AND f.cap = r.cap
       WHERE r.norm IS NULL AND r.track != 'match' AND (f.game IS NULL OR f.expert - f.random >= 1e-9) ORDER BY r.n DESC LIMIT 50`)) if (GAMES[r.game]?.version === r.version) score(r.id, r).catch(quiet);
  };
  return { save, saveMatch, backfill };
}
export type SaveRun = ReturnType<typeof makeRuns>['save'];
