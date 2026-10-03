import { describe, expect, it } from 'vitest';
import { gameContract, play, expertPolicy } from '../core/contract.ts';
import { shifting, rulesOf } from './shifting.ts';
import { beams, levelOf } from './beams.ts';
import { courier } from './courier.ts';

describe('shifting rules', () => {
  gameContract(shifting, { seeds: 10, margin: 20 });
  it('rules differ across seeds and hide outcomes', () => {
    const seen = new Set(Array.from({ length: 12 }, (_, s) => JSON.stringify(rulesOf(s))));
    expect(seen.size).toBeGreaterThan(6);
    expect(shifting.hidesOutcomes).toBe(true);
  });
});
describe('beam router', () => {
  gameContract(beams, { seeds: 12, margin: 1.5 });
  it('the expert solves within the optimal number of flips', () => {
    for (let seed = 0; seed < 12; seed++) { const run = play(beams, seed, expertPolicy(beams)); expect(run.score).toBe(3); expect(run.actions.length).toBe(levelOf(seed).dist[levelOf(seed).start]); }
  });
});
describe('courier', () => {
  gameContract(courier, { seeds: 6, margin: 10 });
});
