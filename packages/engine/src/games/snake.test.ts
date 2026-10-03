import { describe, expect, it } from 'vitest';
import { gameContract, play, expertPolicy } from '../core/contract.ts';
import { snake } from './snake.ts';

describe('snake', () => {
  gameContract(snake, { cap: 600, seeds: 6, margin: 10 });
  it('turning into the wall ends the game', () => {
    let s = snake.init(1);
    for (let i = 0; i < 20 && !snake.done(s); i++) s = snake.step(s, 'straight');
    expect(s.dead).toBe(true);
  });
  it('the expert eats steadily', () => {
    expect(play(snake, 2, expertPolicy(snake), 1500).score).toBeGreaterThan(25);
  });
});
