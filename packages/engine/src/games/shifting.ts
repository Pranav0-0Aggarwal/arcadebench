import { drawInt, shuffle } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';

/** An ArcadeBench original: object values and the control mapping are hidden and drawn per seed. */
const S = 7, OBJECTS = 6, ACTIONS = ['up', 'down', 'left', 'right', 'take'];
const KINDS = ['circle', 'triangle', 'square', 'star'], SYMBOL = ['o', 't', 's', 'x'];
const VEC: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const MAPS: Record<string, string>[] = [
  { up: 'up', down: 'down', left: 'left', right: 'right' },
  { up: 'up', down: 'down', left: 'right', right: 'left' },
  { up: 'right', right: 'down', down: 'left', left: 'up' },
  { up: 'down', down: 'up', left: 'left', right: 'right' },
];
interface Obj { cell: number; kind: number; born: number }
export interface ShiftState { seed: number; pos: number; objects: Obj[]; spawns: number; total: number; steps: number }
const LIFE = 30;

export const rulesOf = (seed: number) => ({ values: shuffle([3, 1, -1, -4], seed, 13), controls: MAPS[drawInt(seed, 14, 0, 4)] });

/** spawn k: kind and cell from stream 15 by index, over the cells not taken */
function spawn(seed: number, k: number, pos: number, objects: { cell: number }[], born: number): Obj {
  const taken = new Set([pos, ...objects.map((o) => o.cell)]), free = [...Array(S * S).keys()].filter((c) => !taken.has(c));
  return { cell: free[drawInt(seed, 15, k * 2 + 1, free.length)], kind: drawInt(seed, 15, k * 2, 4), born };
}
const moveTo = (pos: number, dir: string) => { const x = pos % S + VEC[dir][0], y = Math.floor(pos / S) + VEC[dir][1]; return x < 0 || y < 0 || x >= S || y >= S ? pos : y * S + x; };
const dist = (a: number, b: number) => Math.abs((a % S) - (b % S)) + Math.abs(Math.floor(a / S) - Math.floor(b / S));

export const shifting: Game<ShiftState> = {
  id: 'shifting', prefix: 'SHR', name: 'Shifting Rules', version: '1.0.0', realtime: null, maxSteps: 200,
  rules: 'Shifting Rules, an ArcadeBench original. You (@) walk a 7x7 grid with four kinds of objects: circle (o), triangle (t), square (s) and star (x). "take" picks up the object you stand on and adds its value to your score; a new object then appears elsewhere. Objects that are left alone disappear after 30 steps and are replaced. The values of the four kinds and the way up/down/left/right move you are hidden, differ on every seed, and stay fixed for the whole game: learn them from what happens. The game lasts 200 steps.',
  init(seed) {
    const pos = 3 * S + 3, objects: Obj[] = [];
    for (let k = 0; k < OBJECTS; k++) objects.push(spawn(seed, k, pos, objects, k * 5 - 25));
    return { seed, pos, objects, spawns: OBJECTS, total: 0, steps: 0 };
  },
  legal: () => [...ACTIONS],
  step(s, a) {
    if (!ACTIONS.includes(a)) illegal('shifting', a, ACTIONS);
    const { values, controls } = rulesOf(s.seed), steps = s.steps + 1;
    let { pos, objects, spawns, total } = s;
    if (a !== 'take') pos = moveTo(pos, controls[a]);
    else {
      const i = objects.findIndex((o) => o.cell === pos);
      if (i >= 0) { total += values[objects[i].kind]; const rest = objects.filter((_, j) => j !== i); objects = [...rest, spawn(s.seed, spawns, pos, rest, steps)]; spawns++; }
    }
    // objects expire after LIFE steps and are replaced, so the board never fills with one kind
    for (let i = 0; i < objects.length; i++) if (steps - objects[i].born >= LIFE) {
      const rest = objects.filter((_, j) => j !== i); objects = [...rest.slice(0, i), spawn(s.seed, spawns, pos, rest, steps), ...rest.slice(i)]; spawns++;
    }
    return { seed: s.seed, pos, objects, spawns, total, steps };
  },
  done: (s) => s.steps >= shifting.maxSteps,
  score: (s) => s.total,
  render(s) {
    const g = Array.from({ length: S }, () => Array(S).fill('.'));
    for (const o of s.objects) g[Math.floor(o.cell / S)][o.cell % S] = SYMBOL[o.kind];
    const here = s.objects.find((o) => o.cell === s.pos);
    g[Math.floor(s.pos / S)][s.pos % S] = '@';
    return `${g.map((r) => r.join(' ')).join('\n')}\n@ you${here ? ` (standing on a ${KINDS[here.kind]})` : ''}, o circle, t triangle, s square, x star. score ${s.total}  step ${s.steps}/200`;
  },
  data: (s) => ({ you: [s.pos % S, Math.floor(s.pos / S)], objects: s.objects.map((o) => ({ kind: KINDS[o.kind], at: [o.cell % S, Math.floor(o.cell / S)] })), score: s.total, steps: s.steps }),
  features: (s, a) => (a === 'take' ? { standingOnObject: s.objects.some((o) => o.cell === s.pos) ? 1 : 0 } : { standingOnObject: s.objects.some((o) => o.cell === s.pos) ? 1 : 0 }),
  /** oracle: knows the hidden rules, takes positive objects, walks to the best value per distance */
  values(s) {
    const { values, controls } = rulesOf(s.seed), out: Record<string, number> = {};
    const here = s.objects.find((o) => o.cell === s.pos);
    out.take = here ? (values[here.kind] > 0 ? 10 + values[here.kind] : values[here.kind] - 10) : -5;
    for (const a of ['up', 'down', 'left', 'right']) {
      const p = moveTo(s.pos, controls[a]);
      out[a] = Math.max(0, ...s.objects.filter((o) => values[o.kind] > 0).map((o) => values[o.kind] / (1 + dist(p, o.cell))));
    }
    return out;
  },
  valuesExact: false,
  hidesOutcomes: true,
};
