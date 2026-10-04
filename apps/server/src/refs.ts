import { GAMES } from '@arcadebench/engine';
import type { Db } from './db.ts';
import type { Pool } from './work.ts';

export interface Ref { expert: number; random: number }

export function makeRefs(db: Db, pool: Pool) {
  const pending = new Map<string, Promise<Ref>>();
  const cached = (game: string, seed: number, cap: number) => db.get<Ref>('SELECT expert, random FROM refs WHERE game = ? AND version = ? AND seed = ? AND cap = ?', game, GAMES[game].version, seed, cap);
  function get(game: string, seed: number, cap: number): Promise<Ref> {
    const hit = cached(game, seed, cap), key = `${game}|${seed}|${cap}`;
    if (hit) return Promise.resolve(hit);
    let p = pending.get(key);
    if (!p) {
      p = pool.run('reference', game, seed, cap)
        .then((r) => { db.run('INSERT OR REPLACE INTO refs (game, version, seed, cap, expert, random) VALUES (?, ?, ?, ?, ?, ?)', game, GAMES[game].version, seed, cap, r.expert, r.random); return r; })
        .finally(() => pending.delete(key));
      pending.set(key, p);
    }
    return p;
  }
  return { get, cached };
}
export type Refs = ReturnType<typeof makeRefs>;
