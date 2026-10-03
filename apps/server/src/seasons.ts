import { randomBytes, randomInt } from 'node:crypto';
import type { SeasonInfo } from '@arcadebench/api';
import { GAMES } from '@arcadebench/engine';
import type { Db } from './db.ts';
import { canon, sha256 } from './util.ts';

export const SEEDS = 30, REPEATS = 3, MIN_SEEDS = 10, HALF_WIDTH = 0.05;

export interface Season { id: string; opens: string; closes: string; seeds: Record<string, number[]>; salt: string; commitment: string }
interface Row { id: string; opens: string; closes: string; seeds: string; salt: string; commitment: string }

const closeOf = (opens: number) => { const d = new Date(opens); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 1)).toISOString(); };
const fresh = () => { const s = new Set<number>(); while (s.size < SEEDS) s.add(randomInt(2 ** 32)); return [...s]; };

export function makeSeasons(db: Db, now: () => number) {
  let cur: Season | undefined;
  const load = (r: Row): Season => ({ ...r, seeds: JSON.parse(r.seeds) });
  const latest = () => { const r = db.get<Row>('SELECT * FROM seasons ORDER BY opens DESC LIMIT 1'); return r && load(r); };
  function create(prev: Season | undefined): Season {
    const opens = prev ? prev.closes : new Date(now()).toISOString();
    const seeds = Object.fromEntries(Object.keys(GAMES).map((g) => [g, fresh()])), salt = randomBytes(16).toString('hex');
    const s = { id: `S${String(prev ? +prev.id.slice(1) + 1 : 1).padStart(2, '0')}`, opens, closes: closeOf(Date.parse(opens)), seeds, salt, commitment: sha256(canon({ salt, seeds })) };
    db.run('INSERT INTO seasons (id, opens, closes, seeds, salt, commitment) VALUES (?, ?, ?, ?, ?, ?)', s.id, s.opens, s.closes, JSON.stringify(seeds), salt, s.commitment);
    return s;
  }
  const open = (s: Season) => Date.parse(s.closes) > now();
  function current(): Season {
    if (cur && open(cur)) return cur;
    let s = cur ?? latest() ?? create(undefined);
    while (!open(s)) s = create(s);
    return (cur = s);
  }
  return {
    current,
    byId: (id: string) => { const r = db.get<Row>('SELECT * FROM seasons WHERE id = ?', id); return r && load(r); },
    info(s: Season): SeasonInfo {
      return { id: s.id, opens: s.opens, closes: s.closes, seedsPerGame: SEEDS, commitment: s.commitment, ...(!open(s) ? { revealed: s.seeds, salt: s.salt } : {}) };
    },
  };
}
export type Seasons = ReturnType<typeof makeSeasons>;
