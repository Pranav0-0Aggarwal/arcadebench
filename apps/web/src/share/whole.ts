import { GAMES } from '@arcadebench/engine';
import type { Clip } from './clip.ts';

export interface Source { game: string; seed: number; actions: string[]; who: string; seedCode: string }

export function frames(src: Source, max: number): Clip[] {
  const g = GAMES[src.game], st = [g.init(src.seed)];
  for (const a of src.actions) { const s = st[st.length - 1]; st.push(!g.done(s) && g.legal(s).includes(a) ? g.step(s, a) : s); }
  const n = st.length, k = Math.min(n, max);
  const at = k < 2 ? [n - 1] : Array.from({ length: k }, (_, i) => Math.round(i * (n - 1) / (k - 1)));
  return at.map((i, j) => ({ game: src.game, data: g.data(st[i]), title: g.name, who: src.who, score: g.score(st[i]), seedCode: src.seedCode, at: i, total: n - 1, final: j === at.length - 1 }));
}
