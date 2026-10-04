import { draw, drawInt } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';
import { grid, lines, range } from '../core/util.ts';

const C = 7, R = 6, ORDER = [3, 2, 4, 1, 5, 0, 6], WIN = 100000, GAMES_PER_MATCH = 6;
const LINE = [[0, 1], [1, 0], [1, 1], [1, -1]];
export interface C4State { seed: number; g: number; cells: number[]; moves: number; results: number[]; last: number; prev?: number[] }

const top = (b: number[], c: number) => { for (let r = R - 1; r >= 0; r--) if (!b[r * C + c]) return r; return -1; };
const full = (b: number[]) => b.every(Boolean);
function wins(b: number[], r: number, c: number): boolean {
  const p = b[r * C + c];
  for (const [dr, dc] of LINE) {
    let n = 1;
    for (const s of [1, -1]) for (let k = 1; k < 4; k++) { const rr = r + dr * k * s, cc = c + dc * k * s; if (rr < 0 || rr >= R || cc < 0 || cc >= C || b[rr * C + cc] !== p) break; n++; }
    if (n >= 4) return true;
  }
  return false;
}
const WINDOWS: number[][] = [];
for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const [dr, dc] of LINE) {
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
function columnValues(b: number[], p: number, depth: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const c of ORDER) {
    const r = top(b, c); if (r < 0) continue;
    b[r * C + c] = p;
    out.set(c, wins(b, r, c) ? WIN + depth + 1 : full(b) ? 0 : -negamax(b, depth, -Infinity, Infinity, 3 - p));
    b[r * C + c] = 0;
  }
  return out;
}
function engineMove(b: number[], seed: number, k: number): number {
  const cols = ORDER.filter((c) => top(b, c) >= 0);
  if (draw(seed, 8, k) / 4294967296 < 0.1) return cols[drawInt(seed, 9, k, cols.length)];
  const v = columnValues(b.slice(), 2, 3), best = Math.max(...v.values()), ties = cols.filter((c) => v.get(c) === best);
  return ties[drawInt(seed, 10, k, ties.length)];
}

const POINTS = [0, 1, 0, 0.5];
const rows = (b: number[]) => grid(R, C, (i) => '.XO'[b[i]]).map((r) => r.join(''));
const k32 = (g: number, m: number) => g * 32 + m;
function startGame(seed: number, g: number, results: number[]): C4State {
  const cells = new Array(C * R).fill(0);
  let last = -1;
  if (g % 2 === 1) { const ec = engineMove(cells, seed, k32(g, 31)); cells[top(cells, ec) * C + ec] = 2; last = ec; }
  return { seed, g, cells, moves: 0, results, last };
}
function finish(s: C4State, cells: number[], result: number, last: number): C4State {
  const results = [...s.results, POINTS[result]];
  return s.g + 1 < GAMES_PER_MATCH ? { ...startGame(s.seed, s.g + 1, results), prev: cells } : { seed: s.seed, g: GAMES_PER_MATCH, cells, moves: s.moves + 1, results, last };
}

export const connect4: Game<C4State, 'connect4'> = {
  id: 'connect4', prefix: 'CF4', name: 'Connect Four', version: '1.1.0', realtime: null, maxSteps: GAMES_PER_MATCH * 21,
  rules: 'Connect Four on a 7-column, 6-row board: a match of six games against an engine that searches four moves ahead and plays a random column 10% of the time. You (X) move first in games 1, 3 and 5; the engine (O) moves first in games 2, 4 and 6 and answers every move. Each action drops your disc into a column (c0 to c6, left to right). Four in a row horizontally, vertically or diagonally wins; a full board is a draw. Each game scores win 1, draw 0.5, loss 0; the match total is up to 6.',
  init: (seed) => startGame(seed, 0, []),
  legal: (s) => (s.g >= GAMES_PER_MATCH ? [] : range(C).filter((c) => top(s.cells, c) >= 0).map((c) => `c${c}`)),
  step(s, a) {
    const c = /^c([0-6])$/.test(a) ? +a[1] : -1;
    if (s.g >= GAMES_PER_MATCH || c < 0 || top(s.cells, c) < 0) illegal('connect4', a, connect4.legal(s));
    const b = s.cells.slice(), r = top(b, c); b[r * C + c] = 1;
    if (wins(b, r, c)) return finish(s, b, 1, -1);
    if (full(b)) return finish(s, b, 3, -1);
    const ec = engineMove(b, s.seed, k32(s.g, s.moves)), er = top(b, ec); b[er * C + ec] = 2;
    if (wins(b, er, ec)) return finish(s, b, 2, ec);
    if (full(b)) return finish(s, b, 3, ec);
    return { seed: s.seed, g: s.g, cells: b, moves: s.moves + 1, results: s.results, last: ec };
  },
  done: (s) => s.g >= GAMES_PER_MATCH,
  score: (s) => s.results.reduce((a, b) => a + b, 0),
  render: (s) => `${lines(grid(R, C, (i) => '.XO'[s.cells[i]]), ' ')}\n0 1 2 3 4 5 6\nGame ${Math.min(s.g + 1, GAMES_PER_MATCH)} of ${GAMES_PER_MATCH}. You are X, the engine is O.${s.last >= 0 ? ` The engine just played column ${s.last}.` : ''} Match so far: ${s.results.map((v) => (v === 1 ? 'win' : v === 0.5 ? 'draw' : 'loss')).join(', ') || 'no games finished'}.`,
  data: (s) => ({ game: s.g + 1, board: rows(s.cells), you: 'X', engine: 'O', lastEngineColumn: s.last, results: s.results, ...(s.prev ? { finishedBoard: rows(s.prev) } : {}) }),
  label: (_s, a) => `drop in column ${a[1]}`,
  features(s, a) {
    const c = +a[1], b = s.cells.slice(), r = top(b, c); b[r * C + c] = 1;
    const winsNow = wins(b, r, c) ? 1 : 0;
    let givesWin = 0;
    if (!winsNow && r > 0) { b[(r - 1) * C + c] = 2; givesWin = wins(b, r - 1, c) ? 1 : 0; }
    const t = s.cells.slice(); t[r * C + c] = 2;
    return { winsNow, blocksEngineWin: !winsNow && wins(t, r, c) ? 1 : 0, letsEngineWinAbove: givesWin, height: R - r };
  },
  values(s) { const v = columnValues(s.cells.slice(), 1, 5); return Object.fromEntries([...v].map(([c, x]) => [`c${c}`, x])); },
  valuesExact: false,
};
