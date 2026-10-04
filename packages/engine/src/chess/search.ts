import { draw, drawInt } from '../core/rng.ts';
import { Pos } from './board.ts';

export const MATE = 30000;
const ANALYSIS_DEPTH = 3;
export const LEVELS = [
  { depth: 1, noise: 0.45, nodes: 2e3, elo: 400 },
  { depth: 2, noise: 0.25, nodes: 2e4, elo: 750 },
  { depth: 3, noise: 0.1, nodes: 6e4, elo: 1100 },
  { depth: 4, noise: 0.03, nodes: 12e4, elo: 1450 },
  { depth: 5, noise: 0, nodes: 25e4, elo: 1800 },
] as const;

const P = 1, B = 3, R = 4, K = 6, VAL = [0, 100, 320, 330, 500, 900, 0], BONUS = [0, 0, 8, 4, 0, 2, 0], ADV = [0, 0, 2, 6, 14, 30, 60, 0];
const ctr = (f: number, r: number) => Math.min(f, 7 - f) + Math.min(r, 7 - r);
const pst = (ty: number, f: number, r: number) =>
  VAL[ty] + (ty === P ? ADV[r] + (r > 1 && r < 6 && f > 1 && f < 6 ? 5 : 0) - (f === 0 || f === 7 ? 4 : 0) : ty === R ? (r === 6 ? 15 : 0) : ty === B && !r ? -8 : BONUS[ty] * (ctr(f, r) - 3));
const PV = new Int16Array(16 * 128), KM = new Int16Array(2 * 128), KE = new Int16Array(2 * 128);
for (let c = 0; c < 2; c++) for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
  const s = c ? 1 : -1, sq = (c ? 7 - r : r) * 16 + f;
  for (let ty = P; ty < K; ty++) PV[((ty | (c << 3)) << 7) | sq] = -s * pst(ty, f, r);
  KM[(c << 7) | sq] = -s * (-25 * Math.min(r, 3) - 4 * ctr(f, r) + (!r && (f < 3 || f > 5) ? 20 : 0));
  KE[(c << 7) | sq] = -s * 12 * ctr(f, r);
}

function evaluate(p: Pos): number {
  let s = 0, npm = 0, bw = 0, bb = 0, pawns = 0;
  const { b } = p;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = r * 16 + f, c = b[sq];
    if (!c) continue;
    const ty = c & 7;
    if (ty === K) continue;
    s += PV[(c << 7) | sq];
    if (ty === P) pawns++; else { npm += VAL[ty]; if (ty === B) { if (c >> 3) bb++; else bw++; } }
  }
  if (bw > 1) s += 30;
  if (bb > 1) s -= 30;
  const end = npm <= 3000;
  s += (end ? KE : KM)[p.k[0] | 0] + (end ? KE : KM)[128 | p.k[1]];
  if (end && !pawns && Math.abs(s) > 300) {
    const w = s > 0, lk = p.k[+w], wk = p.k[+!w];
    s += (w ? 1 : -1) * (8 * (6 - ctr(lk & 7, lk >> 4)) + 4 * (14 - Math.abs((lk & 7) - (wk & 7)) - Math.abs((lk >> 4) - (wk >> 4))));
  }
  return p.turn ? -s : s;
}
export const material = (p: Pos) => (p.turn ? -1 : 1) * evaluate(p);

const SIZE = 1 << 16, TK = new Int32Array(SIZE), TS = new Int16Array(SIZE), TD = new Int8Array(SIZE), TF = new Uint8Array(SIZE), TM = new Int32Array(SIZE), TG = new Uint8Array(SIZE);
const KILL = Array.from({ length: 70 }, () => [0, 0]);
let gen = 0, nodes = 0, cap = Infinity, over = false, root = 0;

const next = () => { if (++gen > 255) { gen = 1; TG.fill(0); } nodes = 0; over = false; for (const k of KILL) k[0] = k[1] = 0; };
const score = (p: Pos, m: number, hm: number, ply: number) => {
  if (m === hm) return 1e7;
  const v = p.b[(m >> 7) & 127] & 7 || (((p.b[m & 127] & 7) === P && ((m >> 7) & 127) === p.ep) ? P : 0);
  return v ? 1e5 + 16 * v - (p.b[m & 127] & 7) + (m >> 14 ? 9e3 : 0) : m >> 14 ? 9e4 : m === KILL[ply]?.[0] ? 8e4 : m === KILL[ply]?.[1] ? 7e4 : 0;
};
function pick(ms: number[], sc: number[], i: number) {
  let j = i;
  for (let k = i + 1; k < ms.length; k++) if (sc[k] > sc[j]) j = k;
  if (j !== i) { [ms[i], ms[j]] = [ms[j], ms[i]]; [sc[i], sc[j]] = [sc[j], sc[i]]; }
  return ms[i];
}

function qs(p: Pos, alpha: number, beta: number): number {
  nodes++;
  const st = evaluate(p);
  if (st >= beta) return st;
  if (st > alpha) alpha = st;
  const ms = p.gen(true), sc = ms.map((m) => score(p, m, 0, 0));
  for (let i = 0; i < ms.length; i++) {
    p.make(pick(ms, sc, i));
    if (!p.ok()) { p.unmake(); continue; }
    const v = -qs(p, -beta, -alpha);
    p.unmake();
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function ab(p: Pos, d: number, alpha: number, beta: number, ply: number): number {
  if (++nodes > cap) over = true;
  if (over) return 0;
  if (ply && (p.half >= 100 || p.rep(1))) return 0;
  const chk = p.check();
  if (chk) d++;
  if (d <= 0 || ply >= 64) return qs(p, alpha, beta);
  const i = p.lo & (SIZE - 1), hit = TG[i] === gen && TK[i] === p.hi, hm = hit ? TM[i] : 0;
  if (hit && ply && TD[i] >= d) {
    const v = TS[i] > MATE - 100 ? TS[i] - ply : TS[i] < 100 - MATE ? TS[i] + ply : TS[i], f = TF[i];
    if (f === 1 || (f === 2 && v >= beta) || (f === 3 && v <= alpha)) return v;
  }
  const ms = p.gen(), sc = ms.map((m) => score(p, m, hm, ply)), a0 = alpha;
  let best = -MATE, bm = 0, n = 0;
  for (let k = 0; k < ms.length; k++) {
    const m = pick(ms, sc, k);
    p.make(m);
    if (!p.ok()) { p.unmake(); continue; }
    n++;
    const v = -ab(p, d - 1, -beta, -alpha, ply + 1);
    p.unmake();
    if (over) return 0;
    if (v > best) {
      best = v; bm = m;
      if (!ply) root = m;
      if (v > alpha) {
        alpha = v;
        if (v >= beta) { if (!p.b[(m >> 7) & 127] && !(m >> 14) && KILL[ply][0] !== m) { KILL[ply][1] = KILL[ply][0]; KILL[ply][0] = m; } break; }
      }
    }
  }
  if (!n) return chk ? ply - MATE : 0;
  TG[i] = gen; TK[i] = p.hi; TD[i] = d; TM[i] = bm; TF[i] = best <= a0 ? 3 : best >= beta ? 2 : 1;
  TS[i] = best > MATE - 100 ? best + ply : best < 100 - MATE ? best - ply : best;
  return best;
}

export function think(p: Pos, depth: number, limit = Infinity): { move: number; cp: number } {
  next();
  cap = limit;
  let out = { move: 0, cp: 0 };
  for (let d = 1; d <= depth; d++) {
    root = 0;
    const v = ab(p, d, -MATE, MATE, 0);
    if (over) { if (!out.move && root) out = { move: root, cp: v }; break; }
    out = { move: root, cp: v };
    if (Math.abs(v) > MATE - 100) break;
  }
  return out;
}

export function pickMove(p: Pos, level: number, seed: number, ply: number): number {
  const L = LEVELS[level - 1], ms = p.legal();
  if (ms.length === 1) return ms[0];
  if (draw(seed, 24, ply) / 4294967296 < L.noise) return ms[drawInt(seed, 25, ply, ms.length)];
  return think(p, L.depth, L.nodes).move;
}

export function analyse(p: Pos, depth = ANALYSIS_DEPTH): Map<number, number> {
  next();
  cap = Infinity;
  const out = new Map<number, number>();
  for (const m of p.legal()) { p.make(m); out.set(m, -ab(p, depth - 1, -MATE, MATE, 1)); p.unmake(); }
  return out;
}

export const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-3000, Math.min(3000, cp)))) - 1);
export const tier = (loss: number) => [5, 10, 15].filter((x) => loss >= x).length;
export const accuracy = (loss: number) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
