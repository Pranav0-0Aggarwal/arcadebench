import { shuffle } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';
import { memo, range } from '../core/util.ts';

export const ITEMS = 300;
export interface Picks { seed: number; picks: string[] }
export interface Row<I> { item: I; pick: string; gold: string; sub?: string; subGold?: string }
export interface Sub<I> { on: string; ask: string; opts: string[]; gold(i: I): string | undefined; label(i: I, a: string): string }
export interface Spec<I, K extends string> {
  id: K; prefix: string; name: string; rules: string; ask: string; stream: number; pool: I[];
  sub?: Sub<I>;
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
  const walk = memo((s: Picks) => {
    const list = items(s.seed), rows: Row<I>[] = [];
    let open: Sub<I> | undefined;
    for (let p = 0; p < s.picks.length; p++) {
      const item = list[rows.length], row: Row<I> = { item, pick: s.picks[p], gold: c.gold(item) };
      if (row.pick === c.sub?.on) {
        if (++p === s.picks.length) { open = c.sub; break; }
        row.sub = s.picks[p];
        row.subGold = c.sub.gold(item);
      }
      rows.push(row);
    }
    return { rows, open };
  });
  const now = (s: Picks) => items(s.seed)[walk(s).rows.length];
  const pts = (r: Row<I>) => +(r.pick === r.gold) + +(r.sub !== undefined && r.sub === r.subGold);
  const top = (r: Row<I>) => 1 + +(c.sub?.gold(r.item) !== undefined);
  const score = (s: Picks) => walk(s).rows.reduce((n, r) => n + pts(r), 0);
  const g: Game<Picks, K> = {
    id: c.id, prefix: c.prefix, name: c.name, version: '1.0.0', realtime: null, maxSteps: c.sub ? 2 * ITEMS : ITEMS, rules: c.rules, ask: c.ask,
    init: (seed) => ({ seed, picks: [] }),
    legal: (s) => (g.done(s) ? [] : walk(s).open?.opts ?? c.opts(now(s))),
    step(s, a) {
      const legal = g.legal(s);
      if (!legal.includes(a)) illegal(c.id, a, legal);
      return { seed: s.seed, picks: [...s.picks, a] };
    },
    done: (s) => walk(s).rows.length >= ITEMS,
    score,
    render(s) {
      const { rows, open } = walk(s);
      if (g.done(s)) return `finished: ${score(s)} of ${rows.reduce((n, r) => n + top(r), 0)} right`;
      return `${c.text(now(s))}\n\n${open ? `${open.ask}\n\n` : ''}item ${rows.length + 1} of ${ITEMS}, ${score(s)} right so far`;
    },
    data(s) {
      const { rows, open } = walk(s), last = rows.at(-1);
      return { answered: rows.length, correct: score(s), item: g.done(s) ? null : c.view(now(s)), last: last && { item: c.view(last.item), pick: last.pick, right: last.pick === last.gold, ...(last.sub !== undefined && { sub: last.sub, subRight: last.sub === last.subGold }) }, ...(c.sub && { open: open?.on ?? null }), ...c.tally?.(rows) };
    },
    label: (s, a) => (walk(s).open ?? c).label(now(s), a),
    features: (s, a) => c.feats(now(s), a),
    values(s) {
      const gold = (walk(s).open ?? c).gold(now(s));
      return Object.fromEntries(g.legal(s).map((a) => [a, +(a === gold)]));
    },
    valuesExact: true,
    hidesOutcomes: true,
    ...(c.sub && { asked: (s: Picks) => (walk(s).open ?? c).ask }),
  };
  return g;
}
