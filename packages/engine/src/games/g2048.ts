import { draw, drawInt } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';

/** board cells hold exponents: 0 empty, 1 = 2, 2 = 4, ... */
export interface G2048State { seed: number; board: number[]; score: number; moves: number; spawns: number }
const DIRS = ['up', 'down', 'left', 'right'] as const;
const LINES: Record<string, number[][]> = {
  left: [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => r * 4 + c)),
  right: [0, 1, 2, 3].map((r) => [3, 2, 1, 0].map((c) => r * 4 + c)),
  up: [0, 1, 2, 3].map((c) => [0, 1, 2, 3].map((r) => r * 4 + c)),
  down: [0, 1, 2, 3].map((c) => [3, 2, 1, 0].map((r) => r * 4 + c)),
};

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

/** spawn k: cell index among empties from stream 2, value from stream 3 (90% a 2) */
function spawn(b: number[], seed: number, k: number): number[] {
  const empties = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (!empties.length) return b;
  const nb = b.slice();
  nb[empties[drawInt(seed, 2, k, empties.length)]] = draw(seed, 3, k) / 4294967296 < 0.9 ? 1 : 2;
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
  const empties = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (!empties.length) return heur(b);
  if (depth <= 1) return heur(b);
  let sum = 0;
  for (const e of empties) for (const [v, p] of [[1, 0.9], [2, 0.1]] as const) { b[e] = v; sum += p * maxNode(b, depth - 1); b[e] = 0; }
  return sum / empties.length;
}

export const g2048: Game<G2048State> = {
  id: '2048', prefix: 'N48', name: '2048', version: '1.0.0', realtime: null, maxSteps: 1000,
  rules: '2048 on a 4x4 board. Each move slides every tile up, down, left or right; two equal tiles that meet merge into their sum, which is added to the score. After every move a new tile appears (a 2 with 90% chance, otherwise a 4). Only moves that change the board are allowed. The game ends when no move changes the board or after 1,000 moves.',
  init(seed) { const b = spawn(spawn(new Array(16).fill(0), seed, 0), seed, 1); return { seed, board: b, score: 0, moves: 0, spawns: 2 }; },
  legal: (s) => DIRS.filter((d) => slide(s.board, d).moved),
  step(s, a) {
    if (!g2048.legal(s).includes(a as any)) illegal('2048', a, g2048.legal(s));
    const r = slide(s.board, a);
    return { seed: s.seed, board: spawn(r.board, s.seed, s.spawns), score: s.score + r.gain, moves: s.moves + 1, spawns: s.spawns + 1 };
  },
  done: (s) => s.moves >= g2048.maxSteps || g2048.legal(s).length === 0,
  score: (s) => s.score,
  render: (s) => [0, 1, 2, 3].map((r) => s.board.slice(r * 4, r * 4 + 4).map((v) => (v ? String(2 ** v) : '.').padStart(5)).join('')).join('\n') + `\nscore: ${s.score}  moves: ${s.moves}`,
  data: (s) => ({ board: [0, 1, 2, 3].map((r) => s.board.slice(r * 4, r * 4 + 4).map((v) => (v ? 2 ** v : 0))), score: s.score, moves: s.moves }),
  label: (_s, a) => `slide ${a}`,
  features(s, a) { const r = slide(s.board, a); return { scoreGain: r.gain, merges: r.merges, emptyAfter: r.board.filter((v) => !v).length, maxTile: 2 ** Math.max(...r.board) }; },
  values(s) {
    const out: Record<string, number> = {};
    for (const d of g2048.legal(s)) { const r = slide(s.board, d); out[d] = r.gain + chance(r.board, 2); }
    return out;
  },
  valuesExact: false,
};
