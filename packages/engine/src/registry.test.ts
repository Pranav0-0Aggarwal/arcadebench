import { beforeAll, describe, expect, it } from 'vitest';
import { expertPolicy, play, randomPolicy } from './core/contract.ts';
import { observe, replay, stateHash } from './core/observe.ts';
import { expertAction, type Game } from './core/types.ts';
import { CAPS, CLASSICS, GAMES, LAB, ORIGINALS, parseSeedCode, seedCodeOf } from './index.ts';

const all = Object.values(GAMES);
const ID = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;
const hash = (g: Game<any>, s: unknown) => stateHash(g.data(s));

function run(g: Game<any>, seed: number) {
  const pick = randomPolicy(g), states = [g.init(seed)], actions: string[] = [];
  for (let i = 0; i < g.maxSteps && !g.done(states[i]); i++) {
    actions.push(pick(states[i], i, seed));
    states.push(g.step(states[i], actions[i]));
  }
  return { states, actions };
}

describe('registry', () => {
  it('lists every game once, under its own id, prefix and cap', () => {
    expect(all).toHaveLength(CLASSICS.length + ORIGINALS.length + LAB.length);
    expect(new Set(all.map((g) => g.prefix)).size).toBe(all.length);
    for (const [id, g] of Object.entries(GAMES)) {
      expect([g.id, CAPS[id]]).toEqual([id, g.maxSteps]);
      expect(parseSeedCode(seedCodeOf(id, 1047))).toEqual({ game: id, seed: 1047 });
    }
  });
});

describe.each(all)('$id contract', (g) => {
  let first: ReturnType<typeof run>, sample: unknown[], live: unknown[];
  beforeAll(() => {
    first = run(g, 2);
    sample = first.states.filter((_, i) => i % 5 === 0 || i === first.states.length - 1);
    live = sample.filter((s) => !g.done(s));
  });

  it('declares valid metadata', () => {
    expect(g.prefix).toMatch(/^[A-Z0-9]{3}$/);
    expect(g.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Number.isInteger(g.maxSteps) && g.maxSteps > 0).toBe(true);
    expect(g.name.length * g.rules.length).toBeGreaterThan(0);
    if (g.history !== undefined) expect(Number.isInteger(g.history) && g.history > 0).toBe(true);
    if (g.realtime) {
      expect(g.realtime.framesPerStep).toBeGreaterThan(0);
      expect(g.legal(g.init(1))).toContain(g.realtime.defaultAction);
    }
  });

  it('is deterministic by seed, varies across seeds and replays its own action log', () => {
    const again = run(g, 2);
    expect(again.actions).toEqual(first.actions);
    expect(hash(g, again.states.at(-1))).toBe(hash(g, first.states.at(-1)));
    expect(hash(g, replay(g, 2, first.actions))).toBe(hash(g, first.states.at(-1)));
    expect(new Set([1, 2, 3, 4, 5].map((seed) => hash(g, play(g, seed, randomPolicy(g), 40).s))).size).toBeGreaterThan(1);
  });

  it('steps purely', () => {
    for (const s of live) {
      const before = JSON.stringify(s), a = g.legal(s)[0];
      expect(hash(g, g.step(s, a))).toBe(hash(g, g.step(s, a)));
      expect(JSON.stringify(s)).toBe(before);
    }
  });

  it('offers unique parseable legal ids until done and rejects anything else', () => {
    for (const s of live) {
      const legal = g.legal(s);
      expect(legal.length).toBeGreaterThan(0);
      for (const a of legal) { expect(a).toMatch(ID); expect(a.length).toBeLessThanOrEqual(64); }
      expect(new Set(legal.map((a) => a.toLowerCase())).size).toBe(legal.length);
      expect(() => g.step(s, '__not_an_action__')).toThrow();
    }
  });

  it('values every legal action and only those, and the expert plays a legal one', () => {
    for (const s of live) {
      const v = g.values(s), legal = g.legal(s);
      expect(Object.keys(v).sort()).toEqual([...legal].sort());
      expect(Object.values(v).every(Number.isFinite)).toBe(true);
      expect(legal).toContain(expertAction(g, s));
    }
  });

  it('ends within its step cap under random play, with finite scores', () => {
    expect(g.done(first.states.at(-1))).toBe(true);
    expect(first.actions.length).toBeLessThanOrEqual(g.maxSteps);
    expect(sample.every((s) => Number.isFinite(g.score(s)))).toBe(true);
  });

  it('renders every state and observes live ones at every help level, with finite JSON data', () => {
    const finite = (_: string, v: unknown) => { if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true); return v; };
    for (const s of sample) {
      expect(g.render(s).length).toBeGreaterThan(0);
      JSON.stringify(g.data(s), finite);
    }
    for (const s of live) {
      for (const help of [0, 1, 2] as const) expect(observe(g, s, help).actions.map((a) => a.id)).toEqual(g.legal(s));
    }
  });

  it('has an expert that does not trail random play', () => {
    const cap = Math.min(g.maxSteps, 150), total = (policy: typeof expertPolicy) => [1, 2, 3].reduce((t, seed) => t + play(g, seed, policy(g), cap).score, 0);
    expect(total(expertPolicy)).toBeGreaterThanOrEqual(total(randomPolicy));
  });
});
