import { drawInt } from '@arcadebench/engine';

export interface SeedScore { game: string; seed: number; agent: number; random: number; expert: number }

export const CAP = 1.5;
export function normalize(x: SeedScore, eps = 1e-9): number | null {
  const d = x.expert - x.random;
  return d < eps ? null : Math.min(CAP, (x.agent - x.random) / d);
}

export const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
export function iqm(values: number[]): number {
  const a = [...values].sort((x, y) => x - y), cut = Math.floor(a.length * 0.25);
  return mean(a.slice(cut, a.length - cut));
}
export const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const pct = (sorted: number[], p: number) => { const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

export interface Normalized { byGame: Record<string, number[]>; seedsByGame: Record<string, number[]>; dropped: number }
export function normalizeAll(scores: SeedScore[]): Normalized {
  const byGame: Record<string, number[]> = {}, seedsByGame: Record<string, number[]> = {};
  let dropped = 0;
  for (const x of scores) {
    const n = normalize(x);
    if (n === null) { dropped++; continue; }
    (byGame[x.game] ??= []).push(n); (seedsByGame[x.game] ??= []).push(x.seed);
  }
  return { byGame, seedsByGame, dropped };
}

export function bootstrap(byGame: Record<string, number[]>, stat: (all: number[]) => number = iqm, reps = 2000, rngSeed = 2026): { point: number; lo: number; hi: number; reps: number[] } {
  const games = Object.keys(byGame).sort(), all = games.flatMap((g) => byGame[g]), out: number[] = [];
  for (let r = 0; r < reps; r++) {
    const sample: number[] = [];
    games.forEach((g, gi) => { const v = byGame[g]; for (let i = 0; i < v.length; i++) sample.push(v[drawInt(rngSeed, 4000 + gi, r * 100003 + i, v.length)]); });
    out.push(stat(sample));
  }
  const sorted = [...out].sort((a, b) => a - b);
  return { point: stat(all), lo: pct(sorted, 0.025), hi: pct(sorted, 0.975), reps: out };
}

export interface Entry { name: string; point: number; lo: number; hi: number }
export function tiedGroups(entries: Entry[]): Entry[][] {
  const sorted = [...entries].sort((a, b) => b.point - a.point), groups: Entry[][] = [];
  for (const e of sorted) {
    const g = groups.at(-1);
    if (g && e.hi >= g[0].lo) g.push(e); else groups.push([e]);
  }
  return groups;
}

export function rankIntervals(reps: Record<string, number[]>): Record<string, [number, number]> {
  const names = Object.keys(reps), n = reps[names[0]].length, ranks: Record<string, number[]> = Object.fromEntries(names.map((k) => [k, []]));
  for (let r = 0; r < n; r++) {
    const order = [...names].sort((a, b) => reps[b][r] - reps[a][r]);
    order.forEach((k, i) => ranks[k].push(i + 1));
  }
  return Object.fromEntries(names.map((k) => { const s = ranks[k].sort((a, b) => a - b); return [k, [Math.round(pct(s, 0.025)), Math.round(pct(s, 0.975))]]; }));
}
