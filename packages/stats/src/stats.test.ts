import { describe, expect, it } from 'vitest';
import { bootstrap, iqm, normalize, normalizeAll, rankIntervals, tiedGroups } from './index.ts';

describe('stats', () => {
  it('iqm matches scipy trim_mean(0.25)', () => { expect(iqm([1, 2, 3, 4, 5, 6, 7, 8])).toBe(4.5); expect(iqm([5])).toBe(5); expect(iqm([1, 2, 3, 100])).toBe(2.5); });
  it('normalizes random to 0 and expert to 1, caps at 1.5, drops degenerate seeds', () => {
    expect(normalize({ game: 'g', seed: 0, agent: 2, random: 2, expert: 10 })).toBe(0);
    expect(normalize({ game: 'g', seed: 0, agent: 10, random: 2, expert: 10 })).toBe(1);
    expect(normalize({ game: 'g', seed: 0, agent: 100, random: 2, expert: 10 })).toBe(1.5);
    expect(normalizeAll([{ game: 'g', seed: 0, agent: 1, random: 3, expert: 3 }, { game: 'g', seed: 1, agent: 1, random: 0, expert: 2 }]).dropped).toBe(1);
  });
  it('bootstrap is deterministic and its interval contains the point', () => {
    const data = { a: [0.1, 0.4, 0.5, 0.7, 0.9, 0.3, 0.6, 0.2], b: [0.2, 0.5, 0.55, 0.8, 0.35, 0.6] };
    const x = bootstrap(data, undefined, 500), y = bootstrap(data, undefined, 500);
    expect(x).toEqual(y);
    expect(x.lo).toBeLessThanOrEqual(x.point); expect(x.hi).toBeGreaterThanOrEqual(x.point);
  });
  it('groups overlapping entries and gives rank intervals', () => {
    const g = tiedGroups([{ name: 'a', point: 0.8, lo: 0.7, hi: 0.9 }, { name: 'b', point: 0.75, lo: 0.6, hi: 0.85 }, { name: 'c', point: 0.3, lo: 0.2, hi: 0.4 }]);
    expect(g.map((x) => x.map((e) => e.name))).toEqual([['a', 'b'], ['c']]);
    expect(rankIntervals({ a: [3, 3, 3], b: [1, 2, 4] })).toEqual({ a: [1, 2], b: [1, 2] });
  });
});
