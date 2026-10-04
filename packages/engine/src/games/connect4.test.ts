import { describe, expect, it } from 'vitest';
import { gameContract } from '../core/contract.ts';
import { connect4 } from './connect4.ts';

describe('connect4', () => {
  gameContract(connect4, { seeds: 8, margin: 1.5, ratio: 3 });
  it('takes an immediate win', () => {
    const cells = new Array(42).fill(0); [35, 36, 37].forEach((i) => (cells[i] = 1)); [28, 29, 30].forEach((i) => (cells[i] = 2));
    const s = { seed: 1, g: 0, cells, moves: 3, results: [], last: -1 };
    const v = connect4.values(s), best = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
    expect(best).toBe('c3');
  });
  it('shows the board of a game that just ended, for one step', () => {
    let s = connect4.init(2);
    while (s.results.length === 0) s = connect4.step(s, connect4.legal(s)[0]);
    const d = connect4.data(s) as { finishedBoard: string[]; board: string[] };
    expect(d.finishedBoard.join('').replace(/\./g, '').length).toBeGreaterThanOrEqual(7);
    expect(d.board.join('').replace(/\./g, '')).toBe('O');
    expect(connect4.data(connect4.step(s, connect4.legal(s)[0]))).not.toHaveProperty('finishedBoard');
  });
});
