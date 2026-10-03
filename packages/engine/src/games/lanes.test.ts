import { describe, expect, it } from 'vitest';
import { gameContract, play, expertPolicy } from '../core/contract.ts';
import { lanes } from './lanes.ts';

describe('lanes', () => {
  gameContract(lanes, { seeds: 10, margin: 100 });
  it('the expert runs the whole course and its total equals the DP value', () => {
    const s0 = lanes.init(4), best = Math.max(...Object.values(lanes.values(s0)));
    expect(play(lanes, 4, expertPolicy(lanes)).score).toBe(best);
  });
});
