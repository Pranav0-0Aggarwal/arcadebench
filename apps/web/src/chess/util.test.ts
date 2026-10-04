import { describe, expect, it } from 'vitest';
import { fragment, mmss, pairs, request } from './util.ts';

describe('chess page helpers', () => {
  it('formats a countdown', () => {
    expect(mmss(600_000)).toBe('10:00');
    expect(mmss(61_999)).toBe('1:01');
    expect(mmss(-5)).toBe('0:00');
  });
  it('accepts only seat tokens in the fragment', () => {
    expect(fragment('#abcdefghijklmnop_-1234')).toBe('abcdefghijklmnop_-1234');
    expect(fragment('#short')).toBe('');
    expect(fragment('')).toBe('');
    expect(fragment('#abcdefghijklmnop/../x')).toBe('');
  });
  it('builds the create request', () => {
    expect(request({ kind: 'me', level: 3 }, { kind: 'computer', level: 4 })).toEqual({ white: 'human', black: 'computer:4', me: 'white' });
    expect(request({ kind: 'agent', level: 3 }, { kind: 'me', level: 3 }, 'Ada')).toEqual({ white: 'agent', black: 'human', me: 'black', name: 'Ada' });
    expect(request({ kind: 'human', level: 3 }, { kind: 'agent', level: 3 })).toEqual({ white: 'human', black: 'agent' });
  });
  it('groups plies into moves', () => {
    expect(pairs(3)).toEqual([[0, 1], [2]]);
    expect(pairs(0)).toEqual([]);
  });
});
