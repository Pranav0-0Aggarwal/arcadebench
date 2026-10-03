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
});
