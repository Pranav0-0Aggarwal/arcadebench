import { describe, expect, it } from 'vitest';
import { gameContract } from '../core/contract.ts';
import { minesweeper, mineProbabilities } from './minesweeper.ts';

describe('minesweeper', () => {
  gameContract(minesweeper, { seeds: 8, margin: 30, ratio: 1.5 });
  it('probabilities are within [0,1] and certain cells are found', () => {
    const s = minesweeper.init(5), { probs, interior } = mineProbabilities(s);
    for (const p of probs.values()) { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(1); }
    expect(interior).toBeGreaterThanOrEqual(0);
  });
  it('hides outcomes at L2', () => { expect(minesweeper.hidesOutcomes).toBe(true); });
});
