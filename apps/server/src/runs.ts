import { deflateSync } from 'node:zlib';
import type { Track } from '@arcadebench/api';
import { GAMES, type HelpLevel } from '@arcadebench/engine';
import type { Decision } from '@arcadebench/eval';
import { normalize } from '@arcadebench/stats';
import type { Db } from './db.ts';
import type { Refs } from './refs.ts';
import { median, rid } from './util.ts';

export interface RunIn {
  entry: string | null; game: string; seed: number; repeat: number; track: Track; help: HelpLevel; cap: number; bench: boolean;
  score: number; steps: number; truncated: boolean; decisions: Decision[]; actions: string[];
}

export function makeRuns(db: Db, refs: Refs, changed: () => void) {
  return (r: RunIn) => {
    const id = rid(), real = r.decisions.filter((d) => !d.forced);
    db.run(
      'INSERT INTO runs (id, entry, game, version, seed, repeat, track, help, cap, bench, score, steps, agree, dec, truncated, created, ep, lat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, r.entry, r.game, GAMES[r.game].version, r.seed, r.repeat, r.track, r.help, r.cap, +r.bench, r.score, r.steps, real.filter((d) => d.agree).length, real.length, +r.truncated,
      new Date().toISOString(), deflateSync(JSON.stringify({ actions: r.actions, decisions: r.decisions })), median(real.flatMap((d) => (d.latencyMs === undefined ? [] : [d.latencyMs]))),
    );
    const norm = refs.get(r.game, r.seed, r.cap).then((ref) => {
      const n = normalize({ game: r.game, seed: r.seed, agent: r.score, ...ref });
      db.run('UPDATE runs SET norm = ? WHERE id = ?', n, id);
      changed();
      return n;
    });
    return { id, norm };
  };
}
export type SaveRun = ReturnType<typeof makeRuns>;
