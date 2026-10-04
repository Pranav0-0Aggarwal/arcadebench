import { describe, expect, it } from 'vitest';
import { gameContract } from '../core/contract.ts';
import { pieceAt, tetris } from './tetris.ts';

describe('tetris', () => {
  gameContract(tetris, { cap: 60, seeds: 8 });
  it('uses a 7-bag: every block of 7 pieces holds each kind once', () => {
    for (let b = 0; b < 5; b++) expect(Array.from({ length: 7 }, (_, i) => pieceAt(11, b * 7 + i)).sort().join('')).toBe('IJLOSTZ');
  });
  it('piece sequence does not depend on actions', () => {
    let a = tetris.init(4), b = tetris.init(4);
    a = tetris.step(a, tetris.legal(a)[0]); b = tetris.step(b, tetris.legal(b).at(-1)!);
    expect(tetris.data(a)).toMatchObject({ piece: (tetris.data(b) as any).piece, next: (tetris.data(b) as any).next });
  });
  const at = (kind: string, board: number[]) => ({ seed: 1, board, n: [...Array(7).keys()].find((i) => pieceAt(1, i) === kind)!, lines: 0 });
  it('offers only placements reachable from spawn along the top row', () => {
    const board = new Array(200).fill(0);
    for (let y = 1; y < 20; y++) board[y * 10 + 7] = 1;
    expect(Math.max(...tetris.legal(at('T', board)).map((a) => +a.split('c')[1]))).toBeLessThan(6);
    expect(tetris.legal(at('I', board))).toContain('r0c6');
  });
  it('tops out when the spawn position is blocked', () => {
    const board = new Array(200).fill(0); board[4] = board[14] = 1;
    for (const k of 'IOTSZJL') expect(tetris.done(at(k, board))).toBe(true);
  });
});
