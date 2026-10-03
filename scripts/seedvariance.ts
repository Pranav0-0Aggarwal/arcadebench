/** Seed-to-seed stability: a mid-strength reference agent (expert with 30% random moves) on 40 seeds per game. */
import { GAMES, PAPER_CAPS, drawInt, expertAction } from '../packages/engine/src/index.ts';
import { play, randomPolicy } from '../packages/engine/src/core/contract.ts';
const only = process.argv[2]?.split(','), SEEDS = 40, EPS = 0.3;
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length, sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
for (const g of Object.values(GAMES)) {
  if (only && !only.includes(g.id)) continue;
  const cap = PAPER_CAPS[g.id], norm: number[] = [];
  let dropped = 0;
  for (let seed = 0; seed < SEEDS; seed++) {
    const r = mean([0, 1, 2, 3, 4].map((k) => play(g, seed, randomPolicy(g, k), cap).score));
    const e = play(g, seed, (s) => expertAction(g, s), cap).score;
    const eps = mean([0, 1].map((k) => play(g, seed, (s, i) => { const l = g.legal(s); return drawInt(seed, 950 + k, i, 1000) < EPS * 1000 ? l[drawInt(seed, 960 + k, i, l.length)] : expertAction(g, s); }, cap).score));
    if (e - r < 1e-9) { dropped++; continue; }
    norm.push(Math.min(1.5, (eps - r) / (e - r)));
  }
  const even = norm.filter((_, i) => i % 2 === 0), odd = norm.filter((_, i) => i % 2 === 1), s = sd(norm);
  const need = Math.ceil((1.96 * s / 0.05) ** 2);
  console.log(JSON.stringify({ game: g.id, n: norm.length, dropped, mean: +mean(norm).toFixed(3), sdAcrossSeeds: +s.toFixed(3), splitHalfDiff: +Math.abs(mean(even) - mean(odd)).toFixed(3), ci95Half_20seeds: +(1.96 * s / Math.sqrt(20)).toFixed(3), seedsForPlusMinus005: need }));
}
