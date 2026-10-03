import { shuffle } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';
import { grid, lines, memo, neighbors, range } from '../core/util.ts';

const W = 16, H = 16, N = W * H, MINES = 40, SAFE = N - MINES;
interface Board { mines: Uint8Array; nums: Uint8Array; order: number[]; opening: number[] }
export interface MinesState { seed: number; open: number[]; lost: boolean }

const NB = neighbors(W, H, [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [dx, dy])).filter(([dx, dy]) => dx || dy));

function flood(b: Board, open: Set<number>, start: number) {
  const q = [start];
  while (q.length) {
    const c = q.pop()!;
    if (open.has(c) || b.mines[c]) continue;
    open.add(c);
    if (!b.nums[c]) for (const n of NB[c]) q.push(n);
  }
}

const boardOf = memo((seed: number): Board => {
  const mines = new Uint8Array(N);
  for (const p of shuffle(range(N), seed, 6).slice(0, MINES)) mines[p] = 1;
  const nums = new Uint8Array(N);
  for (let p = 0; p < N; p++) nums[p] = NB[p].filter((q) => mines[q]).length;
  const order = shuffle(range(N), seed, 7);
  const start = order.find((p) => !mines[p] && !nums[p]) ?? order.find((p) => !mines[p])!;
  const b: Board = { mines, nums, order, opening: [] };
  const open = new Set<number>(); flood(b, open, start);
  b.opening = [...open];
  return b;
});

const id = (p: number) => `r${Math.floor(p / W)}c${p % W}`;
const parse = (a: string) => { const m = /^r(\d+)c(\d+)$/.exec(a); return m ? +m[1] * W + +m[2] : -1; };

function frontier(s: MinesState): { front: number[]; interior: number[] } {
  const open = new Set(s.open), front: number[] = [], interior: number[] = [], b = boardOf(s.seed);
  for (const p of b.order) {
    if (open.has(p)) continue;
    (NB[p].some((q) => open.has(q)) ? front : interior).push(p);
  }
  return { front: front.sort((a, c) => a - c), interior };
}

export function mineProbabilities(s: MinesState): { probs: Map<number, number>; interior: number } {
  const b = boardOf(s.seed), open = new Set(s.open), { front, interior } = frontier(s);
  const unknown = front.length + interior.length, density = MINES / Math.max(1, unknown), ratio = density / (1 - density);
  const probs = new Map<number, number>(), known = new Map<number, number>();
  const cons = new Map<number, number[]>();
  for (const p of s.open) { const u = NB[p].filter((q) => !open.has(q)); if (u.length) cons.set(p, u); }
  for (let changed = true; changed;) {
    changed = false;
    for (const [k, u] of cons) {
      let m = 0; const free: number[] = [];
      for (const c of u) { const v = known.get(c); if (v === undefined) free.push(c); else m += v; }
      const need = b.nums[k] - m;
      if (!free.length) continue;
      if (need === 0) { for (const c of free) known.set(c, 0); changed = true; }
      else if (need === free.length) { for (const c of free) known.set(c, 1); changed = true; }
    }
  }
  for (const [c, v] of known) probs.set(c, v);
  const cellCons = new Map<number, number[]>();
  for (const [k, u] of cons) for (const q of u) if (!known.has(q)) { if (!cellCons.has(q)) cellCons.set(q, []); cellCons.get(q)!.push(k); }
  const seen = new Set<number>();
  for (const f of front) {
    if (seen.has(f) || known.has(f)) continue;
    const comp: number[] = [], q = [f]; seen.add(f);
    while (q.length) { const c = q.pop()!; comp.push(c); for (const k of cellCons.get(c) ?? []) for (const n of cons.get(k)!) if (!seen.has(n) && !known.has(n)) { seen.add(n); q.push(n); } }
    const ks = [...new Set(comp.flatMap((c) => cellCons.get(c) ?? []))];
    let ok = comp.length <= 30, budget = 400000, total = 0;
    const assign = new Map<number, number>(known), mineW = new Map<number, number>(comp.map((c) => [c, 0]));
    const consistent = (full: boolean) => ks.every((k) => {
      let m = 0, free = 0;
      for (const c of cons.get(k)!) { const v = assign.get(c); if (v === undefined) free++; else m += v; }
      return full ? m === b.nums[k] : m <= b.nums[k] && m + free >= b.nums[k];
    });
    const rec = (i: number, mines: number) => {
      if (!ok || --budget < 0) { ok = false; return; }
      if (i === comp.length) { if (!consistent(true)) return; const w = ratio ** mines; total += w; for (const c of comp) if (assign.get(c)) mineW.set(c, mineW.get(c)! + w); return; }
      for (const v of [0, 1]) { assign.set(comp[i], v); if (consistent(false)) rec(i + 1, mines + v); }
      assign.delete(comp[i]);
    };
    if (ok) rec(0, 0);
    if (ok && total > 0) for (const c of comp) probs.set(c, mineW.get(c)! / total);
    else for (const c of comp) probs.set(c, Math.max(density, ...(cellCons.get(c) ?? []).map((k) => { const u = cons.get(k)!; const m = u.filter((x) => known.get(x) === 1).length; return (b.nums[k] - m) / Math.max(1, u.filter((x) => !known.has(x)).length); })));
  }
  for (const f of front) if (!probs.has(f)) probs.set(f, density);
  const expected = [...probs.values()].reduce((a, c) => a + c, 0);
  return { probs, interior: interior.length ? Math.min(1, Math.max(0, (MINES - expected) / interior.length)) : 1 };
}

export const minesweeper: Game<MinesState> = {
  id: 'minesweeper', prefix: 'MSW', name: 'Minesweeper', version: '1.0.0', realtime: null, maxSteps: SAFE,
  rules: 'Minesweeper, 16x16 with 40 mines. A safe opening is already revealed. A revealed number counts the mines among its eight neighbours. Each action reveals one cell: either a covered cell next to the revealed area (r<row>c<col>, rows and columns from 0) or "interior", which reveals the next covered cell away from the revealed area. Revealing a mine ends the game. Score: safe cells revealed (216 clears the board).',
  init: (seed) => ({ seed, open: boardOf(seed).opening.slice(), lost: false }),
  legal(s) { const { front, interior } = frontier(s); return [...front.map(id), ...(interior.length ? ['interior'] : [])]; },
  step(s, a) {
    const { front, interior } = frontier(s), b = boardOf(s.seed);
    const p = a === 'interior' ? interior[0] ?? -1 : parse(a);
    if (p < 0 || !(a === 'interior' ? interior.length : front.includes(p))) illegal('minesweeper', a, minesweeper.legal(s));
    if (b.mines[p]) return { seed: s.seed, open: s.open, lost: true };
    const open = new Set(s.open); flood(b, open, p);
    return { seed: s.seed, open: [...open], lost: false };
  },
  done: (s) => s.lost || s.open.length >= SAFE,
  score: (s) => s.open.length,
  render(s) {
    const b = boardOf(s.seed), open = new Set(s.open);
    return `${lines(grid(H, W, (p) => (open.has(p) ? (b.nums[p] ? String(b.nums[p]) : '.') : '#')))}\n# covered, . empty, digits count adjacent mines. revealed: ${s.open.length}/${SAFE}${s.lost ? '  (hit a mine)' : ''}`;
  },
  data: (s) => { const b = boardOf(s.seed), open = new Set(s.open); return { width: W, height: H, mines: MINES, cells: grid(H, W, (p) => (open.has(p) ? b.nums[p] : -1)), revealed: s.open.length, lost: s.lost }; },
  label: (_s, a) => (a === 'interior' ? 'reveal a covered cell away from the numbers' : `reveal row ${a.slice(1, a.indexOf('c'))}, column ${a.slice(a.indexOf('c') + 1)}`),
  features(s, a) {
    if (a === 'interior') return { adjacentNumbers: 0, maxAdjacentNumber: 0 };
    const b = boardOf(s.seed), open = new Set(s.open), ns = NB[parse(a)].filter((q) => open.has(q)).map((q) => b.nums[q]);
    return { adjacentNumbers: ns.filter((v) => v).length, maxAdjacentNumber: Math.max(0, ...ns) };
  },
  values(s) {
    const { probs, interior } = mineProbabilities(s), out: Record<string, number> = {};
    for (const a of minesweeper.legal(s)) out[a] = a === 'interior' ? -interior : -(probs.get(parse(a)) ?? 1);
    return out;
  },
  valuesExact: false,
  hidesOutcomes: true,
};
