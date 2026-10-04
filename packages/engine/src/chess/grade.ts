import { memo } from '../core/util.ts';
import { Pos, uci } from './board.ts';
import { analyse, winPct } from './search.ts';

const raw = memo((fen: string) => Object.fromEntries([...analyse(Pos.fen(fen))].map(([m, cp]) => [uci(m), cp])), 512);

export function scores(fen: string, reps: number[] = []): Record<string, number> {
  const p = Pos.fen(fen, reps), v = { ...raw(fen) };
  for (const m of p.legal()) { p.make(m); if (p.rep(1)) v[uci(m)] = 0; p.unmake(); }
  return v;
}

export function grade(fen: string, reps: number[], move: string) {
  const v = scores(fen, reps), best = Object.keys(v).reduce((a, b) => (v[b] > v[a] ? b : a));
  return { best, bestCp: v[best], cp: v[move], loss: winPct(v[best]) - winPct(v[move]) };
}
