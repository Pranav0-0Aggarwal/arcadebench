import { drawInt } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';

/** integer physics in sub-pixels (16 per px), one step = one 60 Hz frame */
const SU = 16, DX = 40 * SU, JV = 160, G = 10, FASTFALL = 30, GOAL = 3000;
const STAND = { w: 44, h: 47 }, DUCK = { w: 59, h: 26 };
const TYPES = {
  small: { w: 17, h: 35, bottom: 0 }, large: { w: 25, h: 50, bottom: 0 }, group: { w: 51, h: 35, bottom: 0 },
  'bird-low': { w: 46, h: 30, bottom: 8 }, 'bird-mid': { w: 46, h: 30, bottom: 34 }, 'bird-high': { w: 46, h: 30, bottom: 60 },
} as const;
type Kind = keyof typeof TYPES;
interface Obstacle { x: number; kind: Kind }
export interface DinoState { seed: number; frame: number; dist: number; y: number; vy: number; ducking: boolean; dead: boolean }
const ACTIONS = ['wait', 'jump', 'duck'];

export const speedAt = (dist: number) => Math.min(13 * SU, 6 * SU + Math.floor(dist / (600 * SU)));

const cache = new Map<number, Obstacle[]>();
/** obstacle k: kind from stream 10, gap from stream 11; never depends on play */
export function obstaclesOf(seed: number): Obstacle[] {
  const hit = cache.get(seed); if (hit) return hit;
  const out: Obstacle[] = [];
  let x = 600 * SU;
  for (let k = 0; k < 220; k++) {
    const r = drawInt(seed, 10, k, 10);
    const kind: Kind = r < 4 ? 'small' : r < 6 ? 'large' : r < 7 ? 'group' : k < 5 ? 'small' : r === 7 ? 'bird-low' : r === 8 ? 'bird-mid' : 'bird-high';
    out.push({ x, kind });
    const v = speedAt(x) / SU, gap = Math.round(v * 36) + 24 + drawInt(seed, 11, k, 320);
    x += (TYPES[kind].w + gap) * SU;
  }
  cache.set(seed, out);
  return out;
}

function hits(s: DinoState, obs: Obstacle[]): boolean {
  const box = s.ducking ? DUCK : STAND, x0 = s.dist + DX + 4 * SU, x1 = s.dist + DX + (box.w - 4) * SU, y0 = s.y + 2 * SU, y1 = s.y + (box.h - 3) * SU;
  for (const o of obs) {
    if (o.x > x1) break;
    const t = TYPES[o.kind], ox0 = o.x + 3 * SU, ox1 = o.x + (t.w - 3) * SU, oy0 = (t.bottom + 2) * SU, oy1 = (t.bottom + t.h - 2) * SU;
    if (ox1 < x0) continue;
    if (x0 < ox1 && x1 > ox0 && y0 < oy1 && y1 > oy0) return true;
  }
  return false;
}

function stepRaw(s: DinoState, a: string): DinoState {
  const onGround = s.y === 0 && s.vy === 0;
  let { y, vy } = s;
  if (a === 'jump' && onGround) vy = JV;
  if (a === 'duck' && !onGround) vy -= FASTFALL;
  if (!onGround || vy > 0) { y += vy; vy -= G; if (y <= 0) { y = 0; vy = 0; } }
  const n: DinoState = { seed: s.seed, frame: s.frame + 1, dist: s.dist + speedAt(s.dist), y, vy, ducking: a === 'duck' && y === 0, dead: false };
  n.dead = hits(n, obstaclesOf(s.seed));
  return n;
}

const score = (s: DinoState) => Math.floor(s.dist / (10 * SU));
const ahead = (s: DinoState, n = 3) => obstaclesOf(s.seed).filter((o) => o.x + TYPES[o.kind].w * SU > s.dist + DX).slice(0, n);

/** survival over a 60-frame horizon after the action, under a set of simple continuations (wait, hold duck, jump after j frames) */
function survival(s: DinoState, a: string): number {
  const H = 60;
  let first = stepRaw(s, a);
  if (first.dead) return 0;
  let best = 0;
  const plans: ((i: number) => string)[] = [() => 'wait', () => 'duck'];
  for (let j = 0; j <= 30; j += 2) plans.push((i) => (i === j ? 'jump' : 'wait'));
  for (const plan of plans) {
    let t = first, i = 0;
    for (; i < H && !t.dead && score(t) < GOAL; i++) t = stepRaw(t, plan(i));
    best = Math.max(best, t.dead ? i / H : 1);
    if (best === 1) break;
  }
  return best;
}

export const dino: Game<DinoState> = {
  id: 'dino', prefix: 'DNO', name: 'Dino runner', version: '1.0.0', realtime: { framesPerStep: 1, defaultAction: 'wait' }, maxSteps: 6000,
  rules: 'An endless runner at 60 frames per second. The dino runs right and speeds up with distance. Cacti sit on the ground; birds fly low (jump), at mid height (duck) or high (ignore). Each frame: wait, jump (only from the ground) or duck (on the ground it crouches; in the air it falls faster). Touching an obstacle ends the run. Score: one point per 10 px; the run ends at 3,000 points. On timed tracks, frames keep passing while you think, and the dino waits.',
  init: (seed) => ({ seed, frame: 0, dist: 0, y: 0, vy: 0, ducking: false, dead: false }),
  legal: () => [...ACTIONS],
  step(s, a) { if (!ACTIONS.includes(a)) illegal('dino', a, ACTIONS); return stepRaw(s, a); },
  done: (s) => s.dead || score(s) >= GOAL || s.frame >= dino.maxSteps,
  score,
  render(s) {
    const obs = ahead(s).map((o) => { const t = TYPES[o.kind]; return `${o.kind} (${t.w}x${t.h}px${t.bottom ? `, bottom ${t.bottom}px up` : ''}) ${Math.round((o.x - s.dist - DX) / SU)}px ahead`; });
    return `score ${score(s)}  speed ${(speedAt(s.dist) / SU).toFixed(2)} px/frame  dino ${s.y ? `in the air, ${Math.round(s.y / SU)}px up, rising ${(s.vy / SU).toFixed(1)}` : s.ducking ? 'ducking' : 'on the ground'}\nnext obstacles: ${obs.join('; ') || 'none'}\nThe dino is 44x47px standing, 59x26px ducking; a jump lasts 32 frames and peaks at 80px.`;
  },
  data: (s) => ({ score: score(s), speedPxPerFrame: speedAt(s.dist) / SU, dinoHeightPx: s.y / SU, verticalSpeed: s.vy / SU, ducking: s.ducking, obstacles: ahead(s).map((o) => ({ kind: o.kind, distancePx: Math.round((o.x - s.dist - DX) / SU), ...TYPES[o.kind] })) }),
  features(s, a) { const n = stepRaw(s, a), o = ahead(s, 1)[0]; return { survives60Frames: survival(s, a) === 1 ? 1 : 0, diesNextFrame: n.dead ? 1 : 0, nextObstaclePx: o ? Math.round((o.x - s.dist - DX) / SU) : 9999 }; },
  values: (s) => ({ wait: survival(s, 'wait') + 0.002, duck: survival(s, 'duck') + 0.001, jump: survival(s, 'jump') }),
  valuesExact: false,
};
