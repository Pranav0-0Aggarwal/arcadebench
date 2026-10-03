import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { bootstrap, iqm, mean, normalize, rankIntervals, sd, tiedGroups, type SeedScore } from '@arcadebench/stats';
import type { Episode } from './types.ts';

export const SPREAD_LIMIT = 0.03;

export function loadEpisodes(dir: string): Episode[] {
  return readdirSync(dir).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Episode));
}
export const configOf = (e: Episode) => `${e.agent}|${e.harness}|L${e.help}|${e.clock}`;

/** Aggregates every non-baseline configuration against the expert and random references played at the same cap. */
export function summarize(eps: Episode[]) {
  const ref = (agent: string) => {
    const m = new Map<string, number[]>();
    for (const e of eps) if (e.agent === agent && e.harness === 'baseline') { const k = `${e.game}|${e.seed}|${e.cap}`; (m.get(k) ?? m.set(k, []).get(k)!).push(e.score); }
    return new Map([...m].map(([k, v]) => [k, mean(v)]));
  };
  const expert = ref('expert'), random = ref('random');
  const configs = new Map<string, Episode[]>();
  for (const e of eps) if (!(e.harness === 'baseline' && (e.agent === 'expert' || e.agent === 'random'))) (configs.get(configOf(e)) ?? configs.set(configOf(e), []).get(configOf(e))!).push(e);

  const rows = [...configs].map(([config, list]) => {
    // per (game, seed): mean over repeats; per repeat: its own normalized scores (for test-retest)
    const bySeed = new Map<string, Episode[]>();
    for (const e of list) (bySeed.get(`${e.game}|${e.seed}|${e.cap}`) ?? bySeed.set(`${e.game}|${e.seed}|${e.cap}`, []).get(`${e.game}|${e.seed}|${e.cap}`)!).push(e);
    const byGame: Record<string, number[]> = {}, byRepeat = new Map<number, Record<string, number[]>>(), seedOrder: Record<string, number[]> = {};
    let dropped = 0, missingRef = 0;
    for (const [k, group] of bySeed) {
      const [game, seed] = k.split('|'), e = expert.get(k), r = random.get(k);
      if (e === undefined || r === undefined) { missingRef++; continue; }
      const norm = (score: number) => normalize({ game, seed: +seed, agent: score, random: r, expert: e } as SeedScore);
      const n = norm(mean(group.map((x) => x.score)));
      if (n === null) { dropped++; continue; }
      (byGame[game] ??= []).push(n); (seedOrder[game] ??= []).push(+seed);
      for (const x of group) { const v = norm(x.score); if (v === null) continue; const rg = byRepeat.get(x.repeat) ?? byRepeat.set(x.repeat, {}).get(x.repeat)!; (rg[game] ??= []).push(v); }
    }
    if (!Object.keys(byGame).length) return null;
    const b = bootstrap(byGame);
    // test-retest: aggregate IQM per repeat over the seeds that repeat covers
    const perRepeat = [...byRepeat.values()].map((g) => iqm(Object.values(g).flat()));
    const retest = perRepeat.length > 1 ? sd(perRepeat) : null;
    // split-half: even vs odd seeds
    const half = (pick: number) => iqm(Object.entries(byGame).flatMap(([g, v]) => v.filter((_, i) => seedOrder[g][i] % 2 === pick)));
    const decisions = list.flatMap((e) => e.decisions.filter((d) => !d.forced));
    return {
      config, agent: list[0].agent, harness: list[0].harness, help: list[0].help, clock: list[0].clock,
      episodes: list.length, seeds: Object.values(byGame).reduce((t, v) => t + v.length, 0), dropped, missingRef,
      iqm: b.point, lo: b.lo, hi: b.hi, reps: b.reps,
      perGame: Object.fromEntries(Object.entries(byGame).map(([g, v]) => [g, { mean: mean(v), n: v.length }])),
      agreement: decisions.length ? mean(decisions.map((d) => (d.agree ? 1 : 0))) : null,
      invalidRate: decisions.length ? mean(decisions.map((d) => (d.invalid ? 1 : 0))) : null,
      latencyP50: (() => { const l = decisions.map((d) => d.latencyMs ?? 0).sort((a, c) => a - c); return l.length ? l[Math.floor(l.length / 2)] : null; })(),
      tokensOut: decisions.reduce((t, d) => t + (d.tokensOut ?? 0), 0), tokensIn: decisions.reduce((t, d) => t + (d.tokensIn ?? 0), 0),
      retestSpread: retest, repeats: perRepeat.length, splitHalfDiff: Math.abs(half(0) - half(1)),
      stable: retest === null ? null : retest <= SPREAD_LIMIT,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  const groups = tiedGroups(rows.map((r) => ({ name: r.config, point: r.iqm, lo: r.lo, hi: r.hi })));
  const ranks = rows.length > 1 ? rankIntervals(Object.fromEntries(rows.map((r) => [r.config, r.reps]))) : {};
  return { rows: rows.map(({ reps, ...r }) => ({ ...r, rank: ranks[r.config] ?? [1, 1], group: groups.findIndex((g) => g.some((e) => e.name === r.config)) + 1 })).sort((a, b) => b.iqm - a.iqm) };
}

export function report(dir: string, out: string) {
  const s = summarize(loadEpisodes(dir));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(s, null, 2));
  const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined ? '  -  ' : v.toFixed(d));
  console.log('config'.padEnd(46), 'IQM    95% CI          group  agree  invalid  retest  split');
  for (const r of s.rows) console.log(r.config.padEnd(46), f(r.iqm), `[${f(r.lo)}, ${f(r.hi)}]`.padEnd(16), String(r.group).padStart(5), f(r.agreement, 2).padStart(6), f(r.invalidRate, 2).padStart(8), f(r.retestSpread).padStart(7), f(r.splitHalfDiff).padStart(6));
}
