import { drawInt } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';
import { grid, lines, memo, range } from '../core/util.ts';

const S = 9, TICKS = 300, CAP = 3;
const isRoad = (c: number) => (c % S) % 2 === 0 || Math.floor(c / S) % 2 === 0;
const ROADS = range(S * S).filter(isRoad);
const VEC: Record<string, number> = { north: -S, south: S, west: -1, east: 1 };
interface Order { id: number; t: number; from: number; to: number; due: number }
interface Closure { start: number; end: number; cell: number }
export interface CourierState { seed: number; tick: number; pos: number; carrying: number[]; picked: number[]; delivered: number; onTime: number }

const md = (a: number, b: number) => Math.abs((a % S) - (b % S)) + Math.abs(Math.floor(a / S) - Math.floor(b / S));
const worldOf = memo((seed: number) => {
  const orders: Order[] = [];
  for (let k = 0, t = 3; k < 45 && t < TICKS; k++) {
    const from = ROADS[drawInt(seed, 17, k * 4 + 1, ROADS.length)];
    let to = ROADS[drawInt(seed, 17, k * 4 + 2, ROADS.length)];
    if (to === from) to = ROADS[(ROADS.indexOf(from) + 7) % ROADS.length];
    orders.push({ id: k, t, from, to, due: t + 25 + 2 * md(from, to) });
    t += 5 + drawInt(seed, 17, k * 4, 9);
  }
  const closures: Closure[] = [];
  for (let j = 0; j < 18; j++) {
    const start = 8 + j * 16 + drawInt(seed, 18, j * 3, 10), cell = ROADS[1 + drawInt(seed, 18, j * 3 + 1, ROADS.length - 1)];
    closures.push({ start, end: start + 20, cell });
  }
  return { orders, closures };
});
const closedAt = (seed: number, tick: number) => new Set(worldOf(seed).closures.filter((c) => c.start <= tick && tick < c.end).map((c) => c.cell));
const waiting = (s: CourierState) => worldOf(s.seed).orders.filter((o) => o.t <= s.tick && !s.picked.includes(o.id));

const next = (c: number, v: number, closed: Set<number>) => {
  const n = c + v;
  return n < 0 || n >= S * S || (v === 1 && n % S === 0) || (v === -1 && c % S === 0) || !isRoad(n) || closed.has(n) ? -1 : n;
};

function bfs(from: number, closed: Set<number>): Map<number, number> {
  const d = new Map([[from, 0]]), q = [from];
  while (q.length) {
    const c = q.shift()!;
    for (const v of Object.values(VEC)) {
      const n = next(c, v, closed);
      if (n < 0 || d.has(n)) continue;
      d.set(n, d.get(c)! + 1); q.push(n);
    }
  }
  return d;
}

function legalOf(s: CourierState): string[] {
  const out: string[] = [], closed = closedAt(s.seed, s.tick), { orders } = worldOf(s.seed);
  for (const [name, v] of Object.entries(VEC)) if (next(s.pos, v, closed) >= 0) out.push(name);
  if (s.carrying.length < CAP && waiting(s).some((o) => o.from === s.pos)) out.push('pickup');
  if (s.carrying.some((id) => orders[id].to === s.pos)) out.push('dropoff');
  out.push('wait');
  return out;
}

export const courier: Game<CourierState, 'courier'> = {
  id: 'courier', prefix: 'CUR', name: 'Courier', version: '1.0.1', realtime: null, maxSteps: TICKS,
  rules: 'Courier, an ArcadeBench original. You drive a van on the road grid of a 9x9 city (roads are every even row and column). Orders appear over time with a pickup cell, a drop-off cell and a due tick; orders wait until picked up, and you can carry 3 parcels. Roads close for 20 ticks at a time. Each tick: move north, south, east or west along an open road, pick up (at a waiting order\'s pickup), drop off (at a carried parcel\'s destination), or wait. Score: one point per delivery, plus one more if it arrives by its due tick. The shift lasts 300 ticks.',
  init: (seed) => { worldOf(seed); return { seed, tick: 0, pos: 0, carrying: [], picked: [], delivered: 0, onTime: 0 }; },
  legal: legalOf,
  step(s, a) {
    if (!legalOf(s).includes(a)) illegal('courier', a, legalOf(s));
    const { orders } = worldOf(s.seed), n = { ...s, tick: s.tick + 1 };
    if (a in VEC) n.pos = s.pos + VEC[a];
    if (a === 'pickup') { const o = waiting(s).find((o) => o.from === s.pos)!; n.carrying = [...s.carrying, o.id]; n.picked = [...s.picked, o.id]; }
    if (a === 'dropoff') {
      const here = s.carrying.filter((id) => orders[id].to === s.pos);
      n.carrying = s.carrying.filter((id) => !here.includes(id));
      n.delivered = s.delivered + here.length;
      n.onTime = s.onTime + here.filter((id) => s.tick <= orders[id].due).length;
    }
    return n;
  },
  done: (s) => s.tick >= TICKS,
  score: (s) => s.delivered + s.onTime,
  render(s) {
    const { orders } = worldOf(s.seed), closed = closedAt(s.seed, s.tick), xy = (c: number) => `(${c % S},${Math.floor(c / S)})`;
    const g = lines(grid(S, S, (c) => (c === s.pos ? '@' : closed.has(c) ? 'X' : isRoad(c) ? '.' : '#')), ' ');
    const wait = waiting(s).map((o) => `#${o.id} pick ${xy(o.from)} -> drop ${xy(o.to)} due ${o.due}`);
    const carry = s.carrying.map((id) => `#${id} -> ${xy(orders[id].to)} due ${orders[id].due}`);
    return `${g}\n@ van at ${xy(s.pos)} (x,y), . road, # building, X closed road. tick ${s.tick}/${TICKS}\ncarrying (${s.carrying.length}/${CAP}): ${carry.join('; ') || 'nothing'}\nwaiting orders: ${wait.join('; ') || 'none'}\ndelivered ${s.delivered}, on time ${s.onTime}`;
  },
  data: (s) => { const { orders } = worldOf(s.seed), xy = (c: number) => [c % S, Math.floor(c / S)]; return { tick: s.tick, van: xy(s.pos), closed: [...closedAt(s.seed, s.tick)].map(xy), carrying: s.carrying.map((id) => ({ id, to: xy(orders[id].to), due: orders[id].due })), waiting: waiting(s).map((o) => ({ id: o.id, from: xy(o.from), to: xy(o.to), due: o.due })), delivered: s.delivered, onTime: s.onTime }; },
  features(s, a) {
    const { orders } = worldOf(s.seed), p = a in VEC ? s.pos + VEC[a] : s.pos, d = bfs(p, closedAt(s.seed, s.tick + 1));
    const near = (cells: number[]) => Math.min(99, ...cells.map((c) => d.get(c) ?? 99));
    return { distanceToNearestDropoff: near(s.carrying.map((id) => orders[id].to)), distanceToNearestPickup: near(waiting(s).map((o) => o.from)) };
  },
  values(s) {
    const { orders } = worldOf(s.seed), out: Record<string, number> = {}, legal = legalOf(s);
    const targets = [...s.carrying.map((id) => ({ cell: orders[id].to, w: 0, due: orders[id].due })), ...(s.carrying.length < CAP ? waiting(s).map((o) => ({ cell: o.from, w: 2, due: o.due })) : [])];
    const closedNext = closedAt(s.seed, s.tick + 1);
    const cost = (from: number) => { const d = bfs(from, closedNext); return Math.min(1000, ...targets.map((t) => (d.has(t.cell) ? d.get(t.cell)! + t.w + (t.due - s.tick < d.get(t.cell)! ? 4 : 0) : 1000))); };
    for (const a of legal) out[a] = a === 'dropoff' ? 100 : a === 'pickup' ? 50 : -cost(a in VEC ? s.pos + VEC[a] : s.pos) - (a === 'wait' ? 0.5 : 0);
    return out;
  },
  valuesExact: false,
};
