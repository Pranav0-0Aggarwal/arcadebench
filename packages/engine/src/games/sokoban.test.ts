import { describe, expect, it } from 'vitest';
import { gameContract, play, expertPolicy } from '../core/contract.ts';
import { levelOf, sokoban } from './sokoban.ts';

describe('sokoban', () => {
  gameContract(sokoban, { seeds: 10, margin: 1.5 });
  it('generates solvable levels that need at least 12 moves, and the expert solves them optimally', () => {
    for (let seed = 0; seed < 10; seed++) {
      const l = levelOf(seed);
      expect(l.optimal).toBeGreaterThanOrEqual(12);
      const run = play(sokoban, seed, expertPolicy(sokoban));
      expect(run.score).toBe(3);
      expect(run.actions.length).toBe(l.optimal);
    }
  });
});
