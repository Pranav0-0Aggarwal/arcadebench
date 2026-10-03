import { draw, drawInt } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';

const C = 7, R = 6, ORDER = [3, 2, 4, 1, 5, 0, 6], WIN = 100000;
/** cells row-major, row 0 at the top; 1 = you, 2 = engine. result: 0 playing, 1 win, 2 loss, 3 draw */
export interface C4State { seed: number; cells: number[]; moves: number; result: 0 | 1 | 2 | 3; last: number }

const top = (b: number[], c: number) => { for (let r = R - 1; r >= 0; r--) if (!b[r * C + c]) return r; return -1; };
function wins(b: number[], r: number, c: number): boolean {
  const p = b[r * C + c];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) for (let k = 1; k < 4; k++) { const rr = r + dr * k * s, cc = c + dc * k * s; if (rr < 0 || rr >= R || cc < 0 || cc >= C || b[rr * C + cc] !== p) break; n++; }
    if (n >= 4) return true;
  }
  return false;
}
const WINDOWS: number[][] = [];
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
  const w: number[] = [];
  for (let k = 0; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || rr >= R || cc < 0 || cc >= C) break; w.push(rr * C + cc); }
  if (w.length === 4) WINDOWS.push(w);
}
function evalFor(b: number[], p: number): number {
  const o = 3 - p; let s = 0;
  for (let r = 0; r < R; r++) { if (b[r * C + 3] === p) s += 3; else if (b[r * C + 3] === o) s -= 3; }
  for (const w of WINDOWS) {
    let mp = 0, mo = 0;
    for (const i of w) { if (b[i] === p) mp++; else if (b[i] === o) mo++; }
    if (mp && mo) continue;
    if (mp === 3) s += 5; else if (mp === 2) s += 2;
    if (mo === 3) s -= 4; else if (mo === 2) s -= 1;
  }
  return s;
}
function negamax(b: number[], depth: number, alpha: number, beta: number, p: number): number {
  if (depth === 0) return evalFor(b, p);
  let any = false;
  for (const c of ORDER) {
    const r = top(b, c); if (r < 0) continue;
    any = true; b[r * C + c] = p;
    const v = wins(b, r, c) ? WIN + depth : -negamax(b, depth - 1, -beta, -alpha, 3 - p);
    b[r * C + c] = 0;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return any ? alpha : 0;
}
/** what every column is worth to player p, searching `depth` plies after it */
function columnValues(b: number[], p: number, depth: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const c of ORDER) {
    const r = top(b, c); if (r < 0) continue;
    b[r * C + c] = p;
    out.set(c, wins(b, r, c) ? WIN + depth + 1 : b.every((v) => v) ? 0 : -negamax(b, depth, -Infinity, Infinity, 3 - p));
    b[r * C + c] = 0;
  }
  return out;
}
/** the opponent: depth-4 search, seeded tie-breaks, and a seeded 10% random move */
function engineMove(b: number[], seed: number, k: number): number {
  const cols = ORDER.filter((c) => top(b, c) >= 0);
  if (draw(seed, 8, k) / 4294967296 < 0.1) return cols[drawInt(seed, 9, k, cols.length)];
  const v = columnValues(b.slice(), 2, 3), best = Math.max(...v.values()), ties = cols.filter((c) => v.get(c) === best);
  return ties[drawInt(seed, 10, k, ties.length)];
}

export const connect4: Game<C4State> = {
  id: 'connect4', prefix: 'CF4', name: 'Connect Four', version: '1.0.0', realtime: null, maxSteps: 21,
  rules: 'Connect Four on a 7-column, 6-row board. You play first (X); the engine (O) answers every move. Each action drops your disc into a column (c0 to c6, left to right). Four in a row horizontally, vertically or diagonally wins. Score: win 1, draw 0.5, loss 0.',
  init: (seed) => ({ seed, cells: new Array(C * R).fill(0), moves: 0, result: 0, last: -1 }),
  legal: (s) => (s.result ? [] : [0, 1, 2, 3, 4, 5, 6].filter((c) => top(s.cells, c) >= 0).map((c) => `c${c}`)),
  step(s, a) {
    const c = /^c([0-6])$/.test(a) ? +a[1] : -1;
    if (s.result || c < 0 || top(s.cells, c) < 0) illegal('connect4', a, connect4.legal(s));
    const b = s.cells.slice(), r = top(b, c); b[r * C + c] = 1;
    if (wins(b, r, c)) return { seed: s.seed, cells: b, moves: s.moves + 1, result: 1, last: -1 };
    if (b.every((v) => v)) return { seed: s.seed, cells: b, moves: s.moves + 1, result: 3, last: -1 };
    const ec = engineMove(b, s.seed, s.moves), er = top(b, ec); b[er * C + ec] = 2;
    const result = wins(b, er, ec) ? 2 : b.every((v) => v) ? 3 : 0;
    return { seed: s.seed, cells: b, moves: s.moves + 1, result, last: ec };
  },
  done: (s) => s.result !== 0,
  score: (s) => (s.result === 1 ? 1 : s.result === 3 ? 0.5 : 0),
  render: (s) => `${Array.from({ length: R }, (_, r) => s.cells.slice(r * C, r * C + C).map((v) => '.XO'[v]).join(' ')).join('\n')}\n0 1 2 3 4 5 6\nYou are X, the engine is O.${s.last >= 0 ? ` The engine just played column ${s.last}.` : ''}${['', ' You won.', ' You lost.', ' Draw.'][s.result]}`,
  data: (s) => ({ board: Array.from({ length: R }, (_, r) => s.cells.slice(r * C, r * C + C).map((v) => '.XO'[v]).join('')), you: 'X', engine: 'O', lastEngineColumn: s.last, result: ['playing', 'win', 'loss', 'draw'][s.result] }),
  label: (_s, a) => `drop in column ${a[1]}`,
  features(s, a) {
    const c = +a[1], b = s.cells.slice(), r = top(b, c); b[r * C + c] = 1;
    const winsNow = wins(b, r, c) ? 1 : 0;
    let givesWin = 0;
    if (!winsNow && r > 0) { b[(r - 1) * C + c] = 2; givesWin = wins(b, r - 1, c) ? 1 : 0; }
    const threats = [0, 1, 2, 3, 4, 5, 6].filter((cc) => { const rr = top(s.cells, cc); if (rr < 0) return false; const t = s.cells.slice(); t[rr * C + cc] = 2; return wins(t, rr, cc); }).length;
    return { winsNow, blocksEngineWin: threats && !winsNow ? (() => { const t = s.cells.slice(); t[r * C + c] = 2; return wins(t, r, c) ? 1 : 0; })() : 0, letsEngineWinAbove: givesWin, height: R - r };
  },
  values(s) { const v = columnValues(s.cells.slice(), 1, 5); return Object.fromEntries([...v].map(([c, x]) => [`c${c}`, x])); },
  valuesExact: false,
};
