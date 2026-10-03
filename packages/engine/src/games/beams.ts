import { drawInt } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';
import { grid, memo, round6 } from '../core/util.ts';

const S = 6, MIRRORS = 6, COLORS = ['amber', 'blue'];
interface Source { x: number; y: number; dx: number; dy: number }
interface Level { mirrors: number[]; sources: Source[]; targets: number[]; start: number; dist: Int16Array; budget: number }
export interface BeamState { seed: number; k: number; config: number; moves: number; banked: number }
const PUZZLES = 3;
export const puzzleSeed = (seed: number, k: number) => (seed * PUZZLES + k) >>> 0;

function trace(src: Source, mirrors: number[], config: number, targets: number[]): number[] {
  const path: number[] = [];
  let x = src.x, y = src.y, dx = src.dx, dy = src.dy;
  for (let i = 0; i < 64; i++) {
    x += dx; y += dy;
    if (x < 0 || y < 0 || x >= S || y >= S) break;
    const c = y * S + x; path.push(c);
    if (targets.includes(c)) break;
    const k = mirrors.indexOf(c);
    if (k >= 0) [dx, dy] = (config >> k) & 1 ? [dy, dx] : [-dy, -dx];
  }
  return path;
}
const litOf = (l: Pick<Level, 'mirrors' | 'sources' | 'targets'>, config: number) =>
  l.sources.map((src, i) => trace(src, l.mirrors, config, l.targets).at(-1) === l.targets[i]);

export const levelOf = memo((seed: number): Level => {
  for (let attempt = 0; ; attempt++) {
    const r = (i: number, n: number) => drawInt(seed, 16, attempt * 512 + i, n);
    const mirrors: number[] = [];
    for (let i = 0; mirrors.length < MIRRORS; i++) { const c = r(i, S * S); if (!mirrors.includes(c)) mirrors.push(c); }
    const solution = r(40, 1 << MIRRORS);
    const sources: Source[] = [{ x: -1, y: r(41, S), dx: 1, dy: 0 }, { x: r(42, S), y: -1, dx: 0, dy: 1 }];
    const paths = sources.map((src) => trace(src, mirrors, solution, []));
    const targets = paths.map((p) => [...p].reverse().find((c) => !mirrors.includes(c)) ?? -1);
    if (targets.includes(-1) || targets[0] === targets[1]) continue;
    if (paths.some((p) => p.filter((c) => mirrors.includes(c)).length < 2 || p.length < 5)) continue;
    const base = { mirrors, sources, targets };
    if (!litOf(base, solution).every(Boolean)) continue;
    const dist = new Int16Array(1 << MIRRORS).fill(-1), q: number[] = [];
    for (let c = 0; c < 1 << MIRRORS; c++) if (litOf(base, c).every(Boolean)) { dist[c] = 0; q.push(c); }
    for (let h = 0; h < q.length; h++) for (let k = 0; k < MIRRORS; k++) { const n = q[h] ^ (1 << k); if (dist[n] < 0) { dist[n] = dist[q[h]] + 1; q.push(n); } }
    let start = solution;
    for (let k = 0; k < MIRRORS; k++) if (r(60 + k, 2)) start ^= 1 << k;
    if (dist[start] < 2) continue;
    return { ...base, start, dist, budget: dist[start] + 4 };
  }
});

const lvl = (s: BeamState) => levelOf(puzzleSeed(s.seed, Math.min(s.k, PUZZLES - 1)));
const graded = (l: Level, config: number) => Math.max(0, 1 - l.dist[config] / l.dist[l.start]);
const solved = (s: BeamState) => lvl(s).dist[s.config] === 0;
const lit = (s: BeamState) => litOf(lvl(s), s.config).filter(Boolean).length;
const start = (seed: number, k: number, banked: number): BeamState => ({ seed, k, config: levelOf(puzzleSeed(seed, k)).start, moves: 0, banked });
const xy = (c: number) => [c % S, Math.floor(c / S)];

export const beams: Game<BeamState> = {
  id: 'beams', prefix: 'BMR', name: 'Beam Router', version: '1.0.0', realtime: null, maxSteps: 64,
  rules: 'Beam Router, an ArcadeBench original: three puzzles. Each 6x6 grid holds six two-way mirrors (/ or \\). An amber beam enters from the left edge and a blue beam from the top edge. Beams travel straight and turn 90 degrees at mirrors. Each action flips one mirror (flip0 to flip5). Route each beam to the target of its colour (A for amber, B for blue) within the move budget, then the next puzzle starts. Each puzzle scores 100 when solved, otherwise the share of the fewest flips you have completed. Total: up to 300.',
  init: (seed) => start(seed, 0, 0),
  legal: (s) => (s.k >= PUZZLES ? [] : Array.from({ length: MIRRORS }, (_, k) => `flip${k}`)),
  step(s, a) {
    const k = /^flip([0-5])$/.test(a) && s.k < PUZZLES ? +a[4] : -1;
    if (k < 0) illegal('beams', a, beams.legal(s));
    const l = lvl(s), config = s.config ^ (1 << k), moves = s.moves + 1;
    if (l.dist[config] === 0 || moves >= l.budget) {
      const banked = s.banked + graded(l, config);
      return s.k + 1 < PUZZLES ? start(s.seed, s.k + 1, banked) : { seed: s.seed, k: PUZZLES, config, moves, banked };
    }
    return { ...s, config, moves };
  },
  done: (s) => s.k >= PUZZLES,
  score: (s) => round6(100 * (s.banked + (s.k < PUZZLES ? graded(lvl(s), s.config) : 0))),
  render(s) {
    if (s.k >= PUZZLES) return `all three puzzles finished. score ${beams.score(s)}`;
    const l = lvl(s), g = grid(S, S, () => '.'), put = (c: number, v: string) => { const [x, y] = xy(c); g[y][x] = v; };
    l.sources.forEach((src, i) => trace(src, l.mirrors, s.config, l.targets).forEach((c) => put(c, i ? 'b' : 'a')));
    l.mirrors.forEach((c, k) => put(c, (s.config >> k) & 1 ? '\\' : '/'));
    l.targets.forEach((c, i) => put(c, i ? 'B' : 'A'));
    const head = `   ${Array.from({ length: S }, (_, x) => (x === l.sources[1].x ? 'v' : ' ')).join(' ')}`;
    const rows = g.map((r, y) => `${y === l.sources[0].y ? '>' : ' '}  ${r.join(' ')}`);
    const legend = l.mirrors.map((c, k) => { const [x, y] = xy(c); return `flip${k}: mirror at row ${y}, column ${x}`; }).join('; ');
    return `${head}\n${rows.join('\n')}\n> amber source, v blue source, a/b beam paths, A/B targets. ${legend}. puzzle ${s.k + 1}/3  targets lit ${lit(s)}/2  moves ${s.moves}/${l.budget}  score so far ${beams.score(s)}`;
  },
  data: (s) => { const l = lvl(s); return { puzzle: s.k + 1, mirrors: l.mirrors.map((c, k) => ({ at: xy(c), shape: (s.config >> k) & 1 ? '\\' : '/' })), sources: l.sources.map((src, i) => ({ color: COLORS[i], at: [src.x, src.y], direction: [src.dx, src.dy] })), targets: l.targets.map((c, i) => ({ color: COLORS[i], at: xy(c) })), lit: lit(s), moves: s.moves, budget: l.budget, score: beams.score(s) }; },
  label: (s, a) => { const k = +a[4], [x, y] = xy(lvl(s).mirrors[k]); return `flip the mirror at row ${y}, column ${x} to ${(s.config >> k) & 1 ? '/' : '\\'}`; },
  features(s, a) { const l = lvl(s); return { targetsLitAfter: litOf(l, s.config ^ (1 << +a[4])).filter(Boolean).length }; },
  values(s) { const l = lvl(s); return Object.fromEntries(beams.legal(s).map((a) => [a, -(1 + l.dist[s.config ^ (1 << +a[4])])])); },
  valuesExact: true,
};
