import { drawInt } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';

/** An ArcadeBench original: flip mirrors so each coloured beam reaches the target of its colour. */
const S = 6, MIRRORS = 6, COLORS = ['amber', 'blue'];
interface Source { x: number; y: number; dx: number; dy: number }
interface Level { mirrors: number[]; sources: Source[]; targets: number[]; start: number; dist: Int16Array; budget: number }
export interface BeamState { seed: number; config: number; moves: number }

/** '/' turns (dx,dy) into (-dy,-dx); '\' into (dy,dx). bit k of config set = mirror k is '\' */
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

const cache = new Map<number, Level>();
/** build a solved layout first (targets at the end of each beam), then scramble the mirrors */
export function levelOf(seed: number): Level {
  const hit = cache.get(seed); if (hit) return hit;
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
    const lvl = { ...base, start, dist, budget: dist[start] + 4 };
    cache.set(seed, lvl);
    return lvl;
  }
}

const solved = (s: BeamState) => levelOf(s.seed).dist[s.config] === 0;
const lit = (s: BeamState) => litOf(levelOf(s.seed), s.config).filter(Boolean).length;

export const beams: Game<BeamState> = {
  id: 'beams', prefix: 'BMR', name: 'Beam Router', version: '1.0.0', realtime: null, maxSteps: 64,
  rules: 'Beam Router, an ArcadeBench original. A 6x6 grid holds six two-way mirrors (/ or \\). An amber beam enters from the left edge and a blue beam from the top edge. Beams travel straight and turn 90 degrees at mirrors. Each action flips one mirror (flip0 to flip5). Route each beam to the target of its colour (A for amber, B for blue) within the move budget. Score: one point per lit target, plus one when both are lit.',
  init: (seed) => ({ seed, config: levelOf(seed).start, moves: 0 }),
  legal: () => Array.from({ length: MIRRORS }, (_, k) => `flip${k}`),
  step(s, a) {
    const k = /^flip([0-5])$/.test(a) ? +a[4] : -1;
    if (k < 0) illegal('beams', a, beams.legal(s));
    return { seed: s.seed, config: s.config ^ (1 << k), moves: s.moves + 1 };
  },
  done: (s) => solved(s) || s.moves >= levelOf(s.seed).budget,
  score: (s) => lit(s) + (solved(s) ? 1 : 0),
  render(s) {
    const l = levelOf(s.seed), g = Array.from({ length: S }, () => Array(S).fill('.'));
    l.sources.forEach((src, i) => trace(src, l.mirrors, s.config, l.targets).forEach((c) => { g[Math.floor(c / S)][c % S] = i ? 'b' : 'a'; }));
    l.mirrors.forEach((c, k) => { g[Math.floor(c / S)][c % S] = (s.config >> k) & 1 ? '\\' : '/'; });
    l.targets.forEach((c, i) => { g[Math.floor(c / S)][c % S] = i ? 'B' : 'A'; });
    const head = `   ${Array.from({ length: S }, (_, x) => (x === l.sources[1].x ? 'v' : ' ')).join(' ')}`;
    const rows = g.map((r, y) => `${y === l.sources[0].y ? '>' : ' '}  ${r.join(' ')}`);
    const legend = l.mirrors.map((c, k) => `flip${k}: mirror at row ${Math.floor(c / S)}, column ${c % S}`).join('; ');
    return `${head}\n${rows.join('\n')}\n> amber source, v blue source, a/b beam paths, A/B targets. ${legend}. targets lit ${lit(s)}/2  moves ${s.moves}/${l.budget}`;
  },
  data: (s) => { const l = levelOf(s.seed); return { mirrors: l.mirrors.map((c, k) => ({ at: [c % S, Math.floor(c / S)], shape: (s.config >> k) & 1 ? '\\' : '/' })), sources: l.sources.map((src, i) => ({ color: COLORS[i], at: [src.x, src.y], direction: [src.dx, src.dy] })), targets: l.targets.map((c, i) => ({ color: COLORS[i], at: [c % S, Math.floor(c / S)] })), lit: lit(s), moves: s.moves, budget: l.budget }; },
  label: (s, a) => { const l = levelOf(s.seed), k = +a[4], c = l.mirrors[k]; return `flip the mirror at row ${Math.floor(c / S)}, column ${c % S} to ${(s.config >> k) & 1 ? '/' : '\\'}`; },
  features(s, a) { const n = beams.step(s, a); return { targetsLitAfter: lit(n) }; },
  values(s) { const l = levelOf(s.seed); return Object.fromEntries(beams.legal(s).map((a) => [a, -(1 + l.dist[s.config ^ (1 << +a[4])])])); },
  valuesExact: true,
};
