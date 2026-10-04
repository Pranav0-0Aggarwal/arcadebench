import { mix32 } from '../core/rng.ts';

export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
export const SYM = '.PNBRQK..pnbrqk';
const N8 = [-33, -31, -18, -14, 14, 18, 31, 33], K8 = [-17, -16, -15, -1, 1, 15, 16, 17], B4 = [-17, -15, 15, 17], R4 = [-16, -1, 1, 16], Q8 = [...B4, ...R4];
const SIDE = 2048, CAS = 2049, EPK = 2065;
const ZL = new Int32Array(2080), ZH = new Int32Array(2080);
for (let i = 0; i < 2080; i++) { ZL[i] = mix32(i * 2 + 1); ZH[i] = mix32(i * 2 + 0x9e3779b9); }
const CR = new Uint8Array(128).fill(15);
for (const [s, m] of [[0, 13], [4, 12], [7, 14], [112, 7], [116, 3], [119, 11]]) CR[s] = m;

export const sqName = (s: number) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
export const sqOf = (n: string) => n.charCodeAt(0) - 97 + 16 * (n.charCodeAt(1) - 49);
export const uci = (m: number) => sqName(m & 127) + sqName((m >> 7) & 127) + (m >> 14 ? SYM[m >> 14].toLowerCase() : '');

export class Pos {
  b = new Int8Array(128);
  turn = 0; castle = 0; ep = -1; half = 0; full = 1; lo = 0; hi = 0;
  k = [0, 0];
  hist: number[] = [];
  private u: number[] = [];

  static fen(f: string, reps: number[] = []): Pos {
    const [pl, tn, cs = '-', ep = '-', hm = '0', fm = '1'] = f.split(' '), p = new Pos();
    pl.split('/').forEach((row, i) => {
      let sq = (7 - i) * 16;
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') { sq += +ch; continue; }
        const c = SYM.indexOf(ch);
        p.b[sq] = c;
        if ((c & 7) === K) p.k[c >> 3] = sq;
        sq++;
      }
    });
    p.turn = +(tn === 'b');
    p.castle = [...'KQkq'].reduce((a, c, i) => a | (cs.includes(c) ? 1 << i : 0), 0);
    p.ep = ep === '-' ? -1 : sqOf(ep);
    p.half = +hm; p.full = +fm;
    p.rehash();
    p.hist = reps.length ? [...reps] : [p.lo, p.hi];
    return p;
  }

  fen(): string {
    let s = '';
    for (let r = 7; r >= 0; r--) {
      let e = 0;
      for (let f = 0; f < 8; f++) { const c = this.b[r * 16 + f]; if (c) { s += (e || '') + SYM[c]; e = 0; } else e++; }
      s += (e || '') + (r ? '/' : '');
    }
    return `${s} ${this.turn ? 'b' : 'w'} ${[...'KQkq'].filter((_, i) => (this.castle >> i) & 1).join('') || '-'} ${this.ep < 0 ? '-' : sqName(this.ep)} ${this.half} ${this.full}`;
  }

  private z(i: number) { this.lo ^= ZL[i]; this.hi ^= ZH[i]; }
  private rehash() {
    this.lo = this.hi = 0;
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const c = this.b[r * 16 + f]; if (c) this.z((c << 7) | (r * 16 + f)); }
    if (this.turn) this.z(SIDE);
    this.z(CAS + this.castle);
    if (this.ep >= 0) this.z(EPK + (this.ep & 7));
  }

  att(sq: number, by: number): boolean {
    const { b } = this, pw = P | (by << 3), a = by ? sq + 15 : sq - 15, c = by ? sq + 17 : sq - 17;
    if ((!(a & 0x88) && b[a] === pw) || (!(c & 0x88) && b[c] === pw)) return true;
    for (const d of N8) { const t = sq + d; if (!(t & 0x88) && b[t] === (N | (by << 3))) return true; }
    for (const d of K8) { const t = sq + d; if (!(t & 0x88) && b[t] === (K | (by << 3))) return true; }
    for (const d of Q8) {
      const rook = d === 1 || d === -1 || d === 16 || d === -16;
      for (let t = sq + d; !(t & 0x88); t += d) {
        const x = b[t];
        if (x) { if (x >> 3 === by && ((x & 7) === Q || (x & 7) === (rook ? R : B))) return true; break; }
      }
    }
    return false;
  }

  check() { return this.att(this.k[this.turn], this.turn ^ 1); }

  private add(out: number[], f: number, t: number, pr: boolean, caps: boolean) {
    if (!pr) out.push(f | (t << 7));
    else if (caps) out.push(f | (t << 7) | (Q << 14));
    else for (let x = Q; x >= N; x--) out.push(f | (t << 7) | (x << 14));
  }

  gen(caps = false): number[] {
    const { b } = this, us = this.turn, out: number[] = [];
    for (let r = 0; r < 8; r++) for (let sq = r << 4, e = sq + 8; sq < e; sq++) {
      const p = b[sq];
      if (!p || p >> 3 !== us) continue;
      const ty = p & 7;
      if (ty === P) {
        const dir = us ? -16 : 16, pr = r === (us ? 1 : 6), t = sq + dir;
        if (!b[t] && (pr || !caps)) { this.add(out, sq, t, pr, caps); if (!pr && r === (us ? 6 : 1) && !b[t + dir]) out.push(sq | ((t + dir) << 7)); }
        for (let d = dir - 1; d <= dir + 1; d += 2) { const to = sq + d, c = b[to]; if (!(to & 0x88) && ((c && c >> 3 !== us) || to === this.ep)) this.add(out, sq, to, pr, caps); }
      } else if (ty === N || ty === K) {
        for (const d of ty === N ? N8 : K8) { const t = sq + d; if (t & 0x88) continue; const c = b[t]; if (c ? c >> 3 !== us : !caps) out.push(sq | (t << 7)); }
      } else {
        for (const d of ty === B ? B4 : ty === R ? R4 : Q8) {
          for (let t = sq + d; !(t & 0x88); t += d) {
            const c = b[t];
            if (c) { if (c >> 3 !== us) out.push(sq | (t << 7)); break; }
            if (!caps) out.push(sq | (t << 7));
          }
        }
      }
    }
    if (!caps && !this.check()) {
      const o = us ^ 1, s = us ? 112 : 0;
      if ((this.castle >> (us * 2)) & 1 && !b[s + 5] && !b[s + 6] && !this.att(s + 5, o)) out.push((s + 4) | ((s + 6) << 7));
      if ((this.castle >> (us * 2 + 1)) & 1 && !b[s + 1] && !b[s + 2] && !b[s + 3] && !this.att(s + 3, o)) out.push((s + 4) | ((s + 2) << 7));
    }
    return out;
  }

  ok() { return !this.att(this.k[this.turn ^ 1], this.turn); }

  legal(): number[] {
    const out: number[] = [];
    for (const m of this.gen()) { this.make(m); if (this.ok()) out.push(m); this.unmake(); }
    return out;
  }

  make(m: number) {
    const { b } = this, f = m & 127, t = (m >> 7) & 127, pr = m >> 14, p = b[f], ty = p & 7, us = this.turn, cap = b[t];
    this.u.push(m, cap, this.castle, this.ep, this.half);
    this.z(CAS + this.castle);
    if (this.ep >= 0) this.z(EPK + (this.ep & 7));
    this.half++;
    if (us) this.full++;
    b[f] = 0; this.z((p << 7) | f);
    if (cap) { this.z((cap << 7) | t); this.half = 0; }
    let ep = -1;
    if (ty === P) {
      this.half = 0;
      if (t === this.ep) { const c = t + (us ? 16 : -16); this.z((b[c] << 7) | c); b[c] = 0; }
      if (Math.abs(t - f) === 32 && [t - 1, t + 1].some((s) => !(s & 0x88) && b[s] === (P | ((us ^ 1) << 3)))) ep = (f + t) >> 1;
    } else if (ty === K) {
      this.k[us] = t;
      if (Math.abs(t - f) === 2) { const rf = t > f ? f + 3 : f - 4, rt = (f + t) >> 1, r = b[rf]; b[rf] = 0; b[rt] = r; this.z((r << 7) | rf); this.z((r << 7) | rt); }
    }
    const np = pr ? pr | (us << 3) : p;
    b[t] = np; this.z((np << 7) | t);
    this.castle &= CR[f] & CR[t];
    this.z(CAS + this.castle);
    if (ep >= 0) this.z(EPK + (ep & 7));
    this.ep = ep;
    this.turn ^= 1; this.z(SIDE);
    this.hist.push(this.lo, this.hi);
  }

  unmake() {
    const { b, u, hist } = this, half = u.pop()!, ep = u.pop()!, castle = u.pop()!, cap = u.pop()!, m = u.pop()!;
    hist.length -= 2;
    this.lo = hist[hist.length - 2]; this.hi = hist[hist.length - 1];
    this.turn ^= 1;
    if (this.turn) this.full--;
    const us = this.turn, f = m & 127, t = (m >> 7) & 127, p = m >> 14 ? P | (us << 3) : b[t], ty = p & 7;
    b[f] = p; b[t] = cap;
    if (ty === P && t === ep) b[t + (us ? 16 : -16)] = P | ((us ^ 1) << 3);
    else if (ty === K) {
      this.k[us] = f;
      if (Math.abs(t - f) === 2) { const rf = t > f ? f + 3 : f - 4, rt = (f + t) >> 1; b[rf] = b[rt]; b[rt] = 0; }
    }
    this.castle = castle; this.ep = ep; this.half = half;
  }

  rep(n: number): boolean {
    const h = this.hist, c = h.length / 2 - 1;
    let k = 0;
    for (let i = c - 2; i >= 0 && i >= c - this.half; i -= 2) if (h[2 * i] === this.lo && h[2 * i + 1] === this.hi && ++k >= n) return true;
    return false;
  }

  dead(): boolean {
    let minor = 0, knights = 0, tint = 0;
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const ty = this.b[r * 16 + f] & 7;
      if (ty === P || ty === R || ty === Q) return false;
      if (ty === N) { minor++; knights++; } else if (ty === B) { minor++; tint |= 1 << ((r + f) & 1); }
    }
    return minor < 2 || (!knights && tint !== 3);
  }

  perft(d: number): number {
    if (!d) return 1;
    let n = 0;
    for (const m of this.gen()) { this.make(m); if (this.ok()) n += d === 1 ? 1 : this.perft(d - 1); this.unmake(); }
    return n;
  }
}

export function parse(p: Pos, s: string): number {
  return p.legal().find((m) => uci(m) === s) ?? -1;
}

export function san(p: Pos, m: number): string {
  const f = m & 127, t = (m >> 7) & 127, pr = m >> 14, pc = p.b[f], ty = pc & 7, cap = p.b[t] || (ty === P && t === p.ep);
  let s: string;
  if (ty === K && Math.abs(t - f) === 2) s = t > f ? 'O-O' : 'O-O-O';
  else {
    s = ty === P ? (cap ? 'abcdefgh'[f & 7] : '') : SYM[ty];
    if (ty !== P && ty !== K) {
      const o = p.legal().filter((x) => x !== m && p.b[x & 127] === pc && ((x >> 7) & 127) === t);
      if (o.length) s += !o.some((x) => (x & 7) === (f & 7)) ? 'abcdefgh'[f & 7] : !o.some((x) => ((x & 127) >> 4) === f >> 4) ? (f >> 4) + 1 : sqName(f);
    }
    s += (cap ? 'x' : '') + sqName(t) + (pr ? `=${SYM[pr]}` : '');
  }
  p.make(m);
  const mark = p.check() ? (p.legal().length ? '+' : '#') : '';
  p.unmake();
  return s + mark;
}

export type Ending = { why: 'checkmate' | 'stalemate' | 'fifty' | 'threefold' | 'material'; win: number } | null;
export function ending(p: Pos): Ending {
  if (!p.legal().length) return p.check() ? { why: 'checkmate', win: p.turn ^ 1 } : { why: 'stalemate', win: -1 };
  if (p.half >= 100) return { why: 'fifty', win: -1 };
  if (p.rep(2)) return { why: 'threefold', win: -1 };
  return p.dead() ? { why: 'material', win: -1 } : null;
}
