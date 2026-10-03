import { expect, it } from 'vitest';
import { drawInt } from './rng.ts';
import { replay, stateHash } from './observe.ts';
import { expertAction, type Game } from './types.ts';

type Policy<S> = (s: S, step: number, seed: number) => string;

export function play<S>(g: Game<S>, seed: number, policy: Policy<S>, cap = g.maxSteps) {
  let s = g.init(seed);
  const actions: string[] = [];
  for (let i = 0; i < cap && !g.done(s); i++) {
    const a = policy(s, i, seed);
    actions.push(a);
    s = g.step(s, a);
  }
  return { s, score: g.score(s), actions };
}

export const randomPolicy = <S>(g: Game<S>, run = 0): Policy<S> => (s, i, seed) => {
  const legal = g.legal(s);
  return legal[drawInt(seed ^ 0x5eed, 900 + run, i, legal.length)];
};
export const expertPolicy = <S>(g: Game<S>): Policy<S> => (s) => expertAction(g, s);
export const nullPolicy = <S>(g: Game<S>): Policy<S> => (s) => g.legal(s)[0];

export function gameContract<S>(g: Game<S>, opts: { cap?: number; seeds?: number; margin?: number; ratio?: number } = {}) {
  const cap = opts.cap ?? g.maxSteps, seeds = opts.seeds ?? 20, margin = opts.margin ?? 1, ratio = opts.ratio ?? 3;

  it('replays a fixed run exactly (golden)', () => {
    const run = play(g, 7, (s, i) => { const l = g.legal(s); return l[(i * 7 + 3) % l.length]; }, 50);
    const again = replay(g, 7, run.actions);
    expect(stateHash(g.data(again))).toBe(stateHash(g.data(run.s)));
    expect({ score: run.score, hash: stateHash(g.data(run.s)) }).toMatchSnapshot();
  });

  it('always offers legal actions until done and rejects illegal ones', () => {
    for (let seed = 0; seed < 3; seed++) {
      let s = g.init(seed);
      for (let i = 0; i < 80 && !g.done(s); i++) {
        const legal = g.legal(s);
        expect(legal.length).toBeGreaterThan(0);
        expect(new Set(legal).size).toBe(legal.length);
        expect(() => g.step(s, '__not_an_action__')).toThrow();
        s = g.step(s, legal[drawInt(seed, 77, i, legal.length)]);
      }
    }
  });

  it('expert clearly beats random', () => {
    let e = 0, r = 0;
    for (let seed = 0; seed < seeds; seed++) {
      e += play(g, seed, expertPolicy(g), cap).score;
      r += play(g, seed, randomPolicy(g), cap).score;
    }
    e /= seeds; r /= seeds;
    expect(e).toBeGreaterThanOrEqual(r + margin);
    expect(e).toBeGreaterThanOrEqual(r * ratio);
  });

  it('null policy does not beat the expert', () => {
    let e = 0, n = 0;
    for (let seed = 0; seed < 5; seed++) { e += play(g, seed, expertPolicy(g), cap).score; n += play(g, seed, nullPolicy(g), cap).score; }
    expect(n).toBeLessThanOrEqual(e);
  });

  it('values cover exactly the legal actions', () => {
    let s = g.init(3);
    for (let i = 0; i < 10 && !g.done(s); i++) {
      const v = g.values(s), legal = g.legal(s);
      expect(Object.keys(v).sort()).toEqual([...legal].sort());
      for (const a of legal) expect(Number.isFinite(v[a])).toBe(true);
      s = g.step(s, legal[0]);
    }
  });
}
