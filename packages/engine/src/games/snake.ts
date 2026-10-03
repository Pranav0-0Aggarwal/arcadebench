import { drawInt } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';

const W = 16, H = 12, N = W * H;
type P = number; // cell index y*W+x
export interface SnakeState { seed: number; body: P[]; dir: [number, number]; apple: P; apples: number; steps: number; since: number; dead: boolean }
const ACTIONS = ['left', 'straight', 'right'] as const;
const turn = (d: [number, number], a: string): [number, number] => a === 'left' ? [d[1], -d[0]] : a === 'right' ? [-d[1], d[0]] : d;
const xy = (p: P) => [p % W, Math.floor(p / W)] as const;

/** apple k: chosen from the free cells by stream 4 at index k */
function placeApple(seed: number, body: P[], k: number): P {
  const occ = new Set(body), free: P[] = [];
  for (let p = 0; p < N; p++) if (!occ.has(p)) free.push(p);
  return free.length ? free[drawInt(seed, 4, k, free.length)] : -1;
}

/** next head and whether that move kills the snake */
function advance(s: SnakeState, a: string) {
  const d = turn(s.dir, a), [x, y] = xy(s.body[0]), nx = x + d[0], ny = y + d[1];
  const head = ny * W + nx, eats = head === s.apple;
  const out = nx < 0 || ny < 0 || nx >= W || ny >= H;
  const tailMoves = !eats, hit = !out && s.body.some((p, i) => p === head && !(tailMoves && i === s.body.length - 1));
  return { d, head, eats, dead: out || hit };
}

function bfs(from: P, to: P, blocked: Set<P>): P[] | null {
  const prev = new Map<P, P>([[from, -1]]), q = [from];
  while (q.length) {
    const c = q.shift()!;
    if (c === to) { const path: P[] = []; for (let p = c; p !== from; p = prev.get(p)!) path.unshift(p); return path; }
    const [x, y] = xy(c);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev.has(n) || (blocked.has(n) && n !== to)) continue;
      prev.set(n, c); q.push(n);
    }
  }
  return null;
}
function area(from: P, blocked: Set<P>): number {
  const seen = new Set([from]), q = [from];
  while (q.length) {
    const [x, y] = xy(q.shift()!);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(n) || blocked.has(n)) continue;
      seen.add(n); q.push(n);
    }
  }
  return seen.size;
}

/** safe-greedy expert: eat only if the tail stays reachable afterwards, else follow the tail, else maximize space */
function valueOf(s: SnakeState, a: string): number {
  const m = advance(s, a);
  if (m.dead) return -1;
  const body = [m.head, ...(m.eats ? s.body : s.body.slice(0, -1))];
  const tail = body[body.length - 1], blocked = new Set(body.slice(0, -1));
  if (m.eats) return 3 + (bfs(m.head, tail, blocked) ? 1 : 0);
  const path = bfs(m.head, s.apple, new Set(body));
  if (path) {
    let vb = body;
    for (const p of path) vb = [p, ...(p === s.apple ? vb : vb.slice(0, -1))];
    if (bfs(vb[0], vb[vb.length - 1], new Set(vb.slice(0, -1)))) return 2 - path.length / 1000;
  }
  if (bfs(m.head, tail, blocked)) return 1 + (path ? 0 : 0) + area(m.head, blocked) / 10000;
  return area(m.head, blocked) / N;
}

export const snake: Game<SnakeState> = {
  id: 'snake', prefix: 'SNK', name: 'Snake', version: '1.0.0', realtime: null, maxSteps: 5000,
  rules: 'Snake on a 16x12 board with walls. Each step the snake turns left, goes straight, or turns right relative to its heading. Eating the apple grows the snake by one and scores one point; a new apple appears on a free cell. Hitting a wall or the body ends the game, as do 200 steps without eating or 5,000 steps in total.',
  init(seed) { const body = [6 * W + 5, 6 * W + 4, 6 * W + 3]; return { seed, body, dir: [1, 0], apple: placeApple(seed, body, 0), apples: 0, steps: 0, since: 0, dead: false }; },
  legal: () => [...ACTIONS],
  step(s, a) {
    if (!ACTIONS.includes(a as any)) illegal('snake', a, [...ACTIONS]);
    const m = advance(s, a);
    if (m.dead) return { ...s, dir: m.d, steps: s.steps + 1, dead: true };
    const body = [m.head, ...(m.eats ? s.body : s.body.slice(0, -1))];
    const apples = s.apples + (m.eats ? 1 : 0);
    return { seed: s.seed, body, dir: m.d, apple: m.eats ? placeApple(s.seed, body, apples) : s.apple, apples, steps: s.steps + 1, since: m.eats ? 0 : s.since + 1, dead: false };
  },
  done: (s) => s.dead || s.steps >= snake.maxSteps || s.since >= 200 || s.apple < 0,
  score: (s) => s.apples,
  render(s) {
    const g = Array.from({ length: H }, () => Array(W).fill('.'));
    s.body.forEach((p, i) => { const [x, y] = xy(p); g[y][x] = i ? 'o' : 'H'; });
    if (s.apple >= 0) { const [x, y] = xy(s.apple); g[y][x] = 'A'; }
    const heading = s.dir[0] === 1 ? 'right' : s.dir[0] === -1 ? 'left' : s.dir[1] === 1 ? 'down' : 'up';
    return `${g.map((r) => r.join('')).join('\n')}\nH = head (heading ${heading}), o = body, A = apple. apples: ${s.apples}  steps: ${s.steps}  steps since food: ${s.since}/200`;
  },
  data: (s) => ({ width: W, height: H, head: xy(s.body[0]), body: s.body.map(xy), heading: s.dir, apple: s.apple >= 0 ? xy(s.apple) : null, apples: s.apples, steps: s.steps }),
  label: (s, a) => { const d = turn(s.dir, a); return `${a} (moves ${d[0] === 1 ? 'right' : d[0] === -1 ? 'left' : d[1] === 1 ? 'down' : 'up'})`; },
  features(s, a) {
    const m = advance(s, a), [hx, hy] = xy(m.head), [ax, ay] = xy(s.apple);
    const body = m.dead ? s.body : [m.head, ...(m.eats ? s.body : s.body.slice(0, -1))];
    return { dies: m.dead ? 1 : 0, eats: m.eats ? 1 : 0, appleDistance: Math.abs(hx - ax) + Math.abs(hy - ay), freeSpace: m.dead ? 0 : area(m.head, new Set(body.slice(0, -1))) };
  },
  values: (s) => Object.fromEntries(ACTIONS.map((a) => [a, valueOf(s, a)])),
  valuesExact: false,
};
