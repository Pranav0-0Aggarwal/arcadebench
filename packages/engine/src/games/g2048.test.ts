import { describe, expect, it } from 'vitest';
import { gameContract } from '../core/contract.ts';
import { g2048 } from './g2048.ts';

describe('2048', () => {
  gameContract(g2048, { cap: 150, seeds: 6, ratio: 1.5, margin: 200 });
  it('merges equal tiles once per move', () => {
    const s = { seed: 1, board: [1, 1, 1, 1, ...new Array(12).fill(0)], score: 0, moves: 0, spawns: 2 };
    const n = g2048.step(s, 'left');
    expect(n.board.slice(0, 4)).toEqual([2, 2, 0, 0].map((v, i) => (i < 2 ? v : n.board[i])));
    expect(n.score).toBe(8);
  });
});
