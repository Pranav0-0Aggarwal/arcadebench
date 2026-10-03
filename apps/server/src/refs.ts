import type { Db } from './db.ts';
import type { Pool } from './work.ts';

export interface Ref { expert: number; random: number }

export function makeRefs(db: Db, pool: Pool) {
  const pending = new Map<string, Promise<Ref>>();
  function get(game: string, seed: number, cap: number): Promise<Ref> {
    const hit = db.get<Ref>('SELECT expert, random FROM refs WHERE game = ? AND seed = ? AND cap = ?', game, seed, cap);
    if (hit) return Promise.resolve(hit);
    const key = `${game}|${seed}|${cap}`;
    let p = pending.get(key);
    if (!p) {
      p = pool.run('reference', game, seed, cap)
        .then((r) => { db.run('INSERT OR REPLACE INTO refs (game, seed, cap, expert, random) VALUES (?, ?, ?, ?, ?)', game, seed, cap, r.expert, r.random); return r; })
        .finally(() => pending.delete(key));
      pending.set(key, p);
    }
    return p;
  }
  return { get };
}
export type Refs = ReturnType<typeof makeRefs>;
