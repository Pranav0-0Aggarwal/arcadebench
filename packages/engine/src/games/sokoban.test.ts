import { describe, expect, it } from 'vitest';
import { gameContract, play, expertPolicy } from '../core/contract.ts';
import { levelOf, puzzleSeed, sokoban } from './sokoban.ts';

describe('sokoban', () => {
  gameContract(sokoban, { seeds: 10, margin: 100 });
  it('generates solvable puzzles of at least 12 moves; the expert solves all four optimally', () => {
    for (let seed = 0; seed < 8; seed++) {
      const opt = [0, 1, 2, 3].map((k) => levelOf(puzzleSeed(seed, k)).optimal);
      for (const o of opt) expect(o).toBeGreaterThanOrEqual(12);
      const run = play(sokoban, seed, expertPolicy(sokoban));
      expect(run.score).toBe(400);
      expect(run.actions.length).toBe(opt.reduce((a, b) => a + b, 0));
    }
  });
});
