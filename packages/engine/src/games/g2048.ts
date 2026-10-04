import { draw, drawInt } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';
import { grid, lines } from '../core/util.ts';

export interface G2048State { seed: number; board: number[]; score: number; moves: number; spawns: number }
const DIRS = ['up', 'down', 'left', 'right'] as const;
const FWD = [0, 1, 2, 3], BACK = [3, 2, 1, 0];
const LINES: Record<string, number[][]> = {
  left: FWD.map((r) => FWD.map((c) => r * 4 + c)),
  right: FWD.map((r) => BACK.map((c) => r * 4 + c)),
  up: FWD.map((c) => FWD.map((r) => r * 4 + c)),
  down: FWD.map((c) => BACK.map((r) => r * 4 + c)),
};
const empties = (b: number[]) => b.flatMap((v, i) => (v ? [] : [i]));

function slide(b: number[], dir: string): { board: number[]; gain: number; merges: number; moved: boolean } {
  const nb = b.slice();
  let gain = 0, merges = 0, moved = false;
  for (const line of LINES[dir]) {
    const vals = line.map((i) => b[i]).filter((v) => v), out: number[] = [];
    for (let i = 0; i < vals.length; i++) {
      if (i + 1 < vals.length && vals[i] === vals[i + 1]) { out.push(vals[i] + 1); gain += 2 ** (vals[i] + 1); merges++; i++; }
      else out.push(vals[i]);
    }
    line.forEach((idx, k) => { const v = out[k] ?? 0; if (nb[idx] !== v) moved = true; nb[idx] = v; });
  }
  return { board: nb, gain, merges, moved };
}

function spawn(b: number[], seed: number, k: number): number[] {
  const e = empties(b);
  if (!e.length) return b;
  const nb = b.slice();
  nb[e[drawInt(seed, 2, k, e.length)]] = draw(seed, 3, k) / 4294967296 < 0.9 ? 1 : 2;
  return nb;
}

function heur(b: number[]): number {
  let empty = 0, smooth = 0, mono = 0, max = 0;
  for (let i = 0; i < 16; i++) { if (!b[i]) empty++; if (b[i] > max) max = b[i]; }
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const v = b[r * 4 + c];
    if (!v) continue;
    if (c < 3 && b[r * 4 + c + 1]) smooth -= Math.abs(v - b[r * 4 + c + 1]);
    if (r < 3 && b[(r + 1) * 4 + c]) smooth -= Math.abs(v - b[(r + 1) * 4 + c]);
  }
  for (const dir of ['left', 'up']) for (const line of LINES[dir]) {
    let inc = 0, dec = 0;
    for (let k = 0; k < 3; k++) { const a = b[line[k]], c = b[line[k + 1]]; if (a > c) dec += a - c; else inc += c - a; }
    mono -= Math.min(inc, dec);
  }
  const corner = [0, 3, 12, 15].some((i) => b[i] === max) ? max : 0;
  return 2.7 * empty * 10 + 1.0 * mono * 10 + 0.1 * smooth * 10 + corner * 10;
}

function maxNode(b: number[], depth: number): number {
  if (depth === 0) return heur(b);
  let best = -Infinity;
  for (const d of DIRS) { const r = slide(b, d); if (r.moved) best = Math.max(best, r.gain + chance(r.board, depth)); }
  return best === -Infinity ? -1e5 : best;
}
function chance(b: number[], depth: number): number {
  const es = empties(b);
  if (!es.length || depth <= 1) return heur(b);
  let sum = 0;
  for (const e of es) for (const [v, p] of [[1, 0.9], [2, 0.1]] as const) { b[e] = v; sum += p * maxNode(b, depth - 1); b[e] = 0; }
  return sum / es.length;
}

export const g2048: Game<G2048State, '2048'> = {
  id: '2048', prefix: 'N48', name: '2048', version: '1.1.0', realtime: null, maxSteps: 5000,
  rules: '2048 on a 4x4 board. Each move slides every tile up, down, left or right; two equal tiles that meet merge into their sum, which is added to the score. A tile merges at most once per move, and the pair nearest the wall merges first. After every move a new tile appears (a 2 with 90% chance, otherwise a 4). Only moves that change the board are allowed. The game ends when no move changes the board or after 5,000 moves.',
  init(seed) { const b = spawn(spawn(new Array(16).fill(0), seed, 0), seed, 1); return { seed, board: b, score: 0, moves: 0, spawns: 2 }; },
  legal: (s) => DIRS.filter((d) => slide(s.board, d).moved),
  step(s, a) {
    const legal = g2048.legal(s);
    if (!legal.includes(a)) illegal('2048', a, legal);
    const r = slide(s.board, a);
    return { seed: s.seed, board: spawn(r.board, s.seed, s.spawns), score: s.score + r.gain, moves: s.moves + 1, spawns: s.spawns + 1 };
  },
  done: (s) => s.moves >= g2048.maxSteps || g2048.legal(s).length === 0,
  score: (s) => s.score,
  render: (s) => `${lines(grid(4, 4, (i) => (s.board[i] ? String(2 ** s.board[i]) : '.').padStart(5)))}\nscore: ${s.score}  moves: ${s.moves}`,
  data: (s) => ({ board: grid(4, 4, (i) => (s.board[i] ? 2 ** s.board[i] : 0)), score: s.score, moves: s.moves }),
  label: (_s, a) => `slide ${a}`,
  features(s, a) { const r = slide(s.board, a); return { scoreGain: r.gain, merges: r.merges, emptyAfter: r.board.filter((v) => !v).length, maxTile: 2 ** Math.max(...r.board) }; },
  values(s) {
    const out: Record<string, number> = {};
    for (const d of g2048.legal(s)) { const r = slide(s.board, d); out[d] = r.gain + chance(r.board, 2); }
    return out;
  },
  valuesExact: false,
};
