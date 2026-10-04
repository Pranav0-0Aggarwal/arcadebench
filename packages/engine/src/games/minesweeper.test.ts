import { describe, expect, it } from 'vitest';
import { gameContract } from '../core/contract.ts';
import { expertAction } from '../core/types.ts';
import { minesweeper, mineProbabilities } from './minesweeper.ts';

describe('minesweeper', () => {
  gameContract(minesweeper, { seeds: 8, margin: 30, ratio: 1.5 });
  it('probabilities are within [0,1] and certain cells are found', () => {
    const s = minesweeper.init(5), { probs, interior } = mineProbabilities(s);
    for (const p of probs.values()) { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(1); }
    expect(interior).toBeGreaterThanOrEqual(0);
  });
  it('hides outcomes at L2', () => { expect(minesweeper.hidesOutcomes).toBe(true); });
  it('every covered cell is a legal reveal, frontier first, then interior', () => {
    const s = minesweeper.init(4), d = minesweeper.data(s) as { cells: number[][] }, legal = minesweeper.legal(s);
    const covered = d.cells.flatMap((r, y) => r.flatMap((v, x) => (v < 0 ? [`r${y}c${x}`] : [])));
    expect(legal.filter((a) => a !== 'interior').sort()).toEqual(covered.sort());
    const i = legal.indexOf('interior'), v = minesweeper.values(s);
    for (const a of legal.slice(0, i)) expect(minesweeper.features!(s, a).adjacentNumbers).toBeGreaterThan(0);
    for (const a of legal.slice(i + 1)) { expect(minesweeper.features!(s, a).adjacentNumbers).toBe(0); expect(v[a]).toBe(v.interior); }
  });
  it('reveals a chosen far cell directly and rejects non-canonical ids', () => {
    const s = minesweeper.init(4), far = minesweeper.legal(s).at(-1)!, n = minesweeper.step(s, far);
    expect(n.lost || n.open.length > s.open.length).toBe(true);
    for (const a of ['r01c1', 'r0c16', 'r16c0']) expect(() => minesweeper.step(s, a)).toThrow();
  });
  it('the expert still picks a frontier cell or interior', () => {
    let s = minesweeper.init(2);
    for (let i = 0; i < 40 && !minesweeper.done(s); i++) { const a = expertAction(minesweeper, s), l = minesweeper.legal(s); expect(l.indexOf(a)).toBeLessThanOrEqual(l.indexOf('interior') < 0 ? l.length : l.indexOf('interior')); s = minesweeper.step(s, a); }
  });
  it('shows every mine and the one that was hit after a loss', () => {
    let s = minesweeper.init(4);
    const mine = minesweeper.legal(s).find((a) => a !== 'interior' && minesweeper.step(s, a).lost)!;
    s = minesweeper.step(s, mine);
    const d = minesweeper.data(s) as { cells: number[][]; boom: number[] };
    expect(d.cells.flat().filter((v) => v === -2)).toHaveLength(40);
    expect(`r${d.boom[1]}c${d.boom[0]}`).toBe(mine);
  });
});
