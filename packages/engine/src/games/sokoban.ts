import { drawInt } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';
import { grid, lines, memo, range, round6 } from '../core/util.ts';

const W = 8, H = 8, N = W * H, BOXES = 2;
const DIRS: Record<string, number> = { up: -W, down: W, left: -1, right: 1 };
const NAMES = Object.keys(DIRS), STEPS = Object.values(DIRS);
interface Pos { player: number; boxes: number[] }
interface Level { walls: Uint8Array; targets: number[]; start: Pos; dist: Map<number, number>; optimal: number }
export interface SokobanState { seed: number; k: number; player: number; boxes: number[]; moves: number; banked: number }
const PUZZLES = 4, BUDGET = 60;
export const puzzleSeed = (seed: number, k: number) => (seed * PUZZLES + k) >>> 0;

const key = (player: number, boxes: number[]) => { const [a, b] = boxes[0] < boxes[1] ? boxes : [boxes[1], boxes[0]]; return player + N * (a + N * b); };
const solvedBy = (boxes: number[], targets: number[]) => boxes.every((b) => targets.includes(b));

function move(walls: Uint8Array, player: number, boxes: number[], d: number): Pos | null {
  const to = player + d;
  if (walls[to]) return null;
  const bi = boxes.indexOf(to);
  if (bi < 0) return { player: to, boxes };
  const beyond = to + d;
  if (walls[beyond] || boxes.includes(beyond)) return null;
  const nb = boxes.slice(); nb[bi] = beyond;
  return { player: to, boxes: nb };
}

function solve(walls: Uint8Array, targets: number[], start: Pos) {
  const ids = new Map<number, number>(), states: Pos[] = [], rev: number[][] = [];
  const add = (st: Pos) => { const k = key(st.player, st.boxes); let i = ids.get(k); if (i === undefined) { i = states.length; ids.set(k, i); states.push(st); rev.push([]); } return i; };
  add(start);
  for (let i = 0; i < states.length && states.length < 200000; i++) {
    if (solvedBy(states[i].boxes, targets)) continue;
    for (const d of STEPS) { const n = move(walls, states[i].player, states[i].boxes, d); if (n) rev[add(n)].push(i); }
  }
  const dist = new Map<number, number>(), q: number[] = [];
  states.forEach((st, i) => { if (solvedBy(st.boxes, targets)) { dist.set(key(st.player, st.boxes), 0); q.push(i); } });
  const di = new Array(states.length).fill(-1); for (const i of q) di[i] = 0;
  for (let h = 0; h < q.length; h++) for (const p of rev[q[h]]) if (di[p] < 0) { di[p] = di[q[h]] + 1; dist.set(key(states[p].player, states[p].boxes), di[p]); q.push(p); }
  return dist;
}

export const levelOf = memo((seed: number): Level => {
  let best: Level | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = (i: number, n: number) => drawInt(seed, 5, attempt * 4096 + i, n);
    const walls = new Uint8Array(N);
    for (let p = 0; p < N; p++) { const x = p % W, y = Math.floor(p / W); if (x === 0 || y === 0 || x === W - 1 || y === H - 1) walls[p] = 1; }
    for (let i = 0; i < 5; i++) { const p = (1 + r(i, H - 2)) * W + 1 + r(50 + i, W - 2); walls[p] = 1; }
    const floor = range(N).filter((p) => !walls[p]);
    const seen = new Set([floor[0]]), q = [floor[0]];
    while (q.length) { const c = q.shift()!; for (const d of STEPS) if (!walls[c + d] && !seen.has(c + d)) { seen.add(c + d); q.push(c + d); } }
    if (seen.size !== floor.length) continue;
    const targets: number[] = [];
    for (let i = 0; targets.length < BOXES; i++) { const p = floor[r(100 + i, floor.length)]; if (!targets.includes(p)) targets.push(p); }
    let boxes = targets.slice(), player = -1;
    for (let i = 0; player < 0; i++) { const p = floor[r(200 + i, floor.length)]; if (!boxes.includes(p)) player = p; }
    for (let k = 0; k < 240; k++) {
      const d = STEPS[r(300 + k, 4)], to = player + d;
      if (walls[to] || boxes.includes(to)) continue;
      const bi = boxes.indexOf(player - d);
      if (bi >= 0 && r(500 + k, 4) !== 0) { boxes = boxes.slice(); boxes[bi] = player; }
      player = to;
    }
    if (solvedBy(boxes, targets)) continue;
    const dist = solve(walls, targets, { player, boxes });
    const optimal = dist.get(key(player, boxes)) ?? Infinity;
    if (!Number.isFinite(optimal)) continue;
    const lvl = { walls, targets, start: { player, boxes }, dist, optimal };
    if (!best || optimal > best.optimal) best = lvl;
    if (optimal >= 20) break;
  }
  return best!;
});

const lvl = (s: SokobanState) => levelOf(puzzleSeed(s.seed, s.k));
function graded(l: Level, player: number, boxes: number[]): number {
  if (solvedBy(boxes, l.targets)) return 1;
  const d = l.dist.get(key(player, boxes));
  return d === undefined ? 0 : Math.max(0, 1 - d / l.optimal);
}
const start = (seed: number, k: number, banked: number): SokobanState => { const l = levelOf(puzzleSeed(seed, k)); return { seed, k, player: l.start.player, boxes: l.start.boxes.slice(), moves: 0, banked }; };

export const sokoban: Game<SokobanState> = {
  id: 'sokoban', prefix: 'SOK', name: 'Sokoban', version: '1.0.0', realtime: null, maxSteps: PUZZLES * BUDGET,
  rules: 'Sokoban: four puzzles in 8x8 rooms, up to 60 moves each. Move up, down, left or right; walking into a box pushes it one cell if the cell beyond is free. Boxes cannot be pulled. Push every box onto a target. A puzzle ends when solved or after 60 moves, then the next one starts. Each puzzle scores 100 when solved, otherwise the share of the shortest solution you have completed (0 if a box is stuck for good). Total: up to 400.',
  init: (seed) => start(seed, 0, 0),
  legal: (s) => { const l = lvl(s); return NAMES.filter((n) => move(l.walls, s.player, s.boxes, DIRS[n])); },
  step(s, a) {
    const l = lvl(s), n = DIRS[a] !== undefined && s.k < PUZZLES ? move(l.walls, s.player, s.boxes, DIRS[a]) : null;
    if (!n) illegal('sokoban', a, sokoban.legal(s));
    const moves = s.moves + 1;
    if (solvedBy(n.boxes, l.targets) || moves >= BUDGET) {
      const banked = s.banked + graded(l, n.player, n.boxes);
      return s.k + 1 < PUZZLES ? start(s.seed, s.k + 1, banked) : { seed: s.seed, k: PUZZLES, player: n.player, boxes: n.boxes, moves, banked };
    }
    return { ...s, player: n.player, boxes: n.boxes, moves };
  },
  done: (s) => s.k >= PUZZLES,
  score: (s) => round6(100 * (s.banked + (s.k < PUZZLES ? graded(lvl(s), s.player, s.boxes) : 0))),
  render(s) {
    if (s.k >= PUZZLES) return `all four puzzles finished. score ${sokoban.score(s)}`;
    const l = lvl(s);
    const ch = (p: number) => l.walls[p] ? '#' : s.boxes.includes(p) ? (l.targets.includes(p) ? '*' : 'B') : p === s.player ? (l.targets.includes(p) ? '+' : '@') : l.targets.includes(p) ? 'x' : '.';
    return `${lines(grid(H, W, ch))}\n# wall, @ you, B box, x target, * box on target, + you on target. puzzle ${s.k + 1}/${PUZZLES}  moves ${s.moves}/${BUDGET}  score so far ${sokoban.score(s)}`;
  },
  data: (s) => { const l = lvl(s), xy = (p: number) => [p % W, Math.floor(p / W)]; return { puzzle: s.k + 1, walls: range(N).filter((p) => l.walls[p]).map(xy), targets: l.targets.map(xy), boxes: s.boxes.map(xy), player: xy(s.player), moves: s.moves, score: sokoban.score(s) }; },
  label: (s, a) => (s.boxes.includes(s.player + DIRS[a]) ? `push ${a}` : `move ${a}`),
  features(s, a) {
    const l = lvl(s), n = move(l.walls, s.player, s.boxes, DIRS[a])!;
    return { pushes: n.boxes !== s.boxes ? 1 : 0, boxesOnTargetAfter: n.boxes.filter((b) => l.targets.includes(b)).length };
  },
  values(s) {
    const l = lvl(s), out: Record<string, number> = {};
    for (const a of sokoban.legal(s)) { const n = move(l.walls, s.player, s.boxes, DIRS[a])!; const d = l.dist.get(key(n.player, n.boxes)); out[a] = d === undefined ? -1000 : -(1 + d); }
    return out;
  },
  valuesExact: true,
};
