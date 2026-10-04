import { shuffle } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';
import { grid, lines } from '../core/util.ts';

const W = 10, H = 20, KINDS = 'IOTSZJL';
type Cells = [number, number][];
const BASE: Record<string, Cells> = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]], O: [[0, 0], [1, 0], [0, 1], [1, 1]], T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
const norm = (c: Cells): Cells => {
  const mx = Math.min(...c.map((p) => p[0])), my = Math.min(...c.map((p) => p[1]));
  return c.map(([x, y]) => [x - mx, y - my] as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
const ROT: Record<string, Cells[]> = {};
for (const k of KINDS) {
  const seen = new Set<string>(), out: Cells[] = [];
  let r = BASE[k];
  for (let i = 0; i < 4; i++) {
    const n = norm(r), key = JSON.stringify(n);
    if (!seen.has(key)) { seen.add(key); out.push(n); }
    r = r.map(([x, y]) => [-y, x] as [number, number]);
  }
  ROT[k] = out;
}

export interface TetrisState { seed: number; board: number[]; n: number; lines: number; clr?: { rows: number[]; pre: number[] } }

export const pieceAt = (seed: number, n: number) => shuffle([...KINDS], seed, 1, Math.floor(n / 7) * 8)[n % 7];

const collide = (b: number[], c: Cells, x: number, y: number) =>
  c.some(([cx, cy]) => { const xx = x + cx, yy = y + cy; return xx < 0 || xx >= W || yy >= H || b[yy * W + xx] !== 0; });

interface Placed { board: number[]; pre: number[]; rows: number[]; cleared: number; eroded: number; y: number; h: number }
function place(b: number[], kind: string, r: number, x: number): Placed | null {
  const c = ROT[kind][r];
  if (collide(b, c, x, 0)) return null;
  let y = 0;
  while (!collide(b, c, x, y + 1)) y++;
  const nb = b.slice(), id = KINDS.indexOf(kind) + 1;
  for (const [cx, cy] of c) nb[(y + cy) * W + x + cx] = id;
  const full: number[] = [];
  for (let row = 0; row < H; row++) {
    let f = true;
    for (let col = 0; col < W; col++) if (!nb[row * W + col]) { f = false; break; }
    if (f) full.push(row);
  }
  const eroded = c.filter(([, cy]) => full.includes(y + cy)).length;
  let out = nb;
  if (full.length) {
    const keep: number[] = [];
    for (let row = 0; row < H; row++) if (!full.includes(row)) keep.push(...nb.slice(row * W, row * W + W));
    out = new Array(full.length * W).fill(0).concat(keep);
  }
  return { board: out, pre: nb, rows: full, cleared: full.length, eroded, y, h: Math.max(...c.map((p) => p[1])) + 1 };
}

function placements(b: number[], kind: string): { id: string; r: number; x: number }[] {
  const R = ROT[kind], n = R.length, ok = R.map(() => new Array<boolean>(W).fill(false)), q: [number, number][] = [];
  const go = (r: number, x: number) => { if (!ok[r][x] && !collide(b, R[r], x, 0)) { ok[r][x] = true; q.push([r, x]); } };
  go(0, (W - Math.max(...R[0].map((p) => p[0])) - 1) >> 1);
  while (q.length) { const [r, x] = q.pop()!; go(r, x - 1); go(r, x + 1); go((r + 1) % n, x); go((r + n - 1) % n, x); }
  return R.flatMap((_, r) => ok[r].flatMap((v, x) => (v ? [{ id: `r${r}c${x}`, r, x }] : [])));
}

function boardFeatures(b: number[]) {
  let rowT = 0, colT = 0, holes = 0, wells = 0;
  const f = (x: number, y: number) => x < 0 || x >= W || b[y * W + x] !== 0;
  for (let y = 0; y < H; y++) {
    let prev = true;
    for (let x = 0; x < W; x++) { const cur = f(x, y); if (cur !== prev) rowT++; prev = cur; }
    if (!prev) rowT++;
  }
  for (let x = 0; x < W; x++) {
    let prev = false, seen = false, run = 0;
    for (let y = 0; y < H; y++) {
      const cur = b[y * W + x] !== 0;
      if (cur !== prev) colT++;
      prev = cur;
      if (cur) seen = true; else if (seen) holes++;
      if (!cur && f(x - 1, y) && f(x + 1, y)) { run++; wells += run; } else run = 0;
    }
    if (!prev) colT++;
  }
  return { rowT, colT, holes, wells };
}
const WT = { lh: -4.500158825082766, er: 3.4181268101392694, rowT: -3.2178882868487753, colT: -9.348695305445199, holes: -7.899265427351652, wells: -3.3855972247263626 };
const pieceTerm = (p: Placed) => WT.lh * (H - p.y - (p.h - 1) / 2) + WT.er * p.cleared * p.eroded;
const boardTerm = (b: number[]) => { const f = boardFeatures(b); return WT.rowT * f.rowT + WT.colT * f.colT + WT.holes * f.holes + WT.wells * f.wells; };

const heights = (b: number[]) => Array.from({ length: W }, (_, x) => { for (let y = 0; y < H; y++) if (b[y * W + x]) return H - y; return 0; });

const rows = (b: number[]) => grid(H, W, (i) => (b[i] ? KINDS[b[i] - 1] : '.')).map((r) => r.join(''));

export const tetris: Game<TetrisState> = {
  id: 'tetris', prefix: 'TET', name: 'Tetris', version: '2.0.0', realtime: null, maxSteps: 500,
  rules: 'Placement Tetris: a 10-wide, 20-tall well, 7-bag randomizer, one preview piece, no hold. There is no gravity and no timer. Each action (r<rotation>c<column>) picks the final rotation and the left column of the current piece, which then hard-drops straight down. Only placements the piece can reach by rotating and sliding along the top row from its spawn position are legal, so pieces cannot slide under overhangs. Full rows clear and score one line each. The game ends when a new piece cannot spawn or after 500 pieces.',
  init: (seed) => ({ seed, board: new Array(W * H).fill(0), n: 0, lines: 0 }),
  legal: (s) => placements(s.board, pieceAt(s.seed, s.n)).map((p) => p.id),
  step(s, a) {
    const kind = pieceAt(s.seed, s.n), p = placements(s.board, kind).find((q) => q.id === a);
    if (!p) illegal('tetris', a, this.legal(s));
    const r = place(s.board, kind, p.r, p.x)!;
    return { seed: s.seed, board: r.board, n: s.n + 1, lines: s.lines + r.cleared, ...(r.cleared ? { clr: { rows: r.rows, pre: r.pre } } : {}) };
  },
  done(s) { return s.n >= this.maxSteps || this.legal(s).length === 0; },
  score: (s) => s.lines,
  render: (s) => `${lines(grid(H, W, (i) => (s.board[i] ? '#' : '.')))}\ncurrent: ${pieceAt(s.seed, s.n)}  next: ${pieceAt(s.seed, s.n + 1)}  lines: ${s.lines}  pieces: ${s.n}/500`,
  data: (s) => ({ board: rows(s.board), piece: pieceAt(s.seed, s.n), next: pieceAt(s.seed, s.n + 1), lines: s.lines, pieces: s.n, clear: s.clr ? { rows: s.clr.rows, board: rows(s.clr.pre) } : null }),
  label: (_s, a) => { const m = /^r(\d+)c(\d+)$/.exec(a)!; return `rotation ${m[1]}, left edge at column ${m[2]}`; },
  features(s, a) {
    const p = placements(s.board, pieceAt(s.seed, s.n)).find((q) => q.id === a)!;
    const r = place(s.board, pieceAt(s.seed, s.n), p.r, p.x)!, hs = heights(r.board), f = boardFeatures(r.board);
    let bump = 0; for (let i = 1; i < W; i++) bump += Math.abs(hs[i] - hs[i - 1]);
    return { linesCleared: r.cleared, holes: f.holes, maxHeight: Math.max(...hs), bumpiness: bump };
  },
  values(s) {
    const kind = pieceAt(s.seed, s.n), next = pieceAt(s.seed, s.n + 1), out: Record<string, number> = {};
    for (const p of placements(s.board, kind)) {
      const r = place(s.board, kind, p.r, p.x)!;
      let best = -1e9;
      for (const q of placements(r.board, next)) {
        const r2 = place(r.board, next, q.r, q.x)!;
        best = Math.max(best, pieceTerm(r2) + boardTerm(r2.board));
      }
      out[p.id] = pieceTerm(r) + (best > -1e9 ? best : boardTerm(r.board) - 500);
    }
    return out;
  },
  valuesExact: false,
};
