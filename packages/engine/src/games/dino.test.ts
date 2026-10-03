import { describe, expect, it } from 'vitest';
import { gameContract, play, expertPolicy } from '../core/contract.ts';
import { dino, obstaclesOf } from './dino.ts';

describe('dino', () => {
  gameContract(dino, { seeds: 4, margin: 300 });
  it('obstacles are fixed by the seed alone', () => { expect(obstaclesOf(9)).toEqual(obstaclesOf(9)); expect(obstaclesOf(9)).not.toEqual(obstaclesOf(10)); });
  it('the expert finishes the course', () => { expect(play(dino, 1, expertPolicy(dino)).score).toBe(3000); });
});
