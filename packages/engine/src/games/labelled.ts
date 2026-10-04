import { shuffle } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';
import { memo, range } from '../core/util.ts';

export const ITEMS = 300;
export interface Picks { seed: number; picks: string[] }
export interface Row<I> { item: I; pick: string; gold: string }
export interface Spec<I, K extends string> {
  id: K; prefix: string; name: string; rules: string; ask: string; stream: number; pool: I[];
  gold(i: I): string;
  opts(i: I): string[];
  label(i: I, a: string): string;
  feats(i: I, a: string): Record<string, number>;
  text(i: I): string;
  view(i: I): object;
  tally?(rows: Row<I>[]): object;
}

export function labelled<I, K extends string>(c: Spec<I, K>): Game<Picks, K> {
  const pool = [...new Map(c.pool.map((i) => [c.text(i), i])).values()];
  const items = memo((seed: number) => shuffle(range(pool.length), seed, c.stream).slice(0, ITEMS).map((k) => pool[k]));
  const now = (s: Picks) => items(s.seed)[s.picks.length];
  const rows = (s: Picks): Row<I>[] => s.picks.map((pick, k) => { const item = items(s.seed)[k]; return { item, pick, gold: c.gold(item) }; });
  const score = (s: Picks) => rows(s).filter((r) => r.pick === r.gold).length;
  const g: Game<Picks, K> = {
    id: c.id, prefix: c.prefix, name: c.name, version: '1.0.0', realtime: null, maxSteps: ITEMS, rules: c.rules, ask: c.ask,
    init: (seed) => ({ seed, picks: [] }),
    legal: (s) => (g.done(s) ? [] : c.opts(now(s))),
    step(s, a) {
      const legal = g.legal(s);
      if (!legal.includes(a)) illegal(c.id, a, legal);
      return { seed: s.seed, picks: [...s.picks, a] };
    },
    done: (s) => s.picks.length >= ITEMS,
    score,
    render: (s) => (g.done(s) ? `finished: ${score(s)} of ${ITEMS} right` : `${c.text(now(s))}\n\nitem ${s.picks.length + 1} of ${ITEMS}, ${score(s)} right so far`),
    data(s) {
      const r = rows(s), last = r.at(-1);
      return { answered: r.length, correct: score(s), item: g.done(s) ? null : c.view(now(s)), last: last && { item: c.view(last.item), pick: last.pick, right: last.pick === last.gold }, ...c.tally?.(r) };
    },
    label: (s, a) => c.label(now(s), a),
    features: (s, a) => c.feats(now(s), a),
    values: (s) => Object.fromEntries(g.legal(s).map((a) => [a, +(a === c.gold(now(s)))])),
    valuesExact: true,
    hidesOutcomes: true,
  };
  return g;
}
