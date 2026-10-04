import { describe, expect, it } from 'vitest';
import { GAMES } from '@arcadebench/engine';
import type { Clip, Grid } from './clip.ts';
import { frames, heading, type Source } from './whole.ts';

function src(game: string, seed: number, n: number, name = 'Bot'): Source {
  const g = GAMES[game], actions: string[] = [];
  for (let s = g.init(seed); actions.length < n && !g.done(s);) { const a = g.legal(s)[0]; actions.push(a); s = g.step(s, a); }
  return { game, seed, actions, who: name, seedCode: `${game}-${seed}`, entry: { name } };
}

const grid = (s: Source[], max: number) => frames(s, max) as Grid[];

describe('frames', () => {
  it('samples one board from the second state to the last', () => {
    const f = frames(src('snake', 1, 20), 6) as Clip[];
    expect(f).toHaveLength(6);
    expect(f[0].at).toBe(1);
    expect(f.at(-1)).toMatchObject({ at: f[0].total, final: true });
  });

  it('advances every board by its own progress so all start and end together', () => {
    const f = grid([src('snake', 1, 10), src('2048', 2, 40), src('tetris', 3, 25)], 5);
    expect(f).toHaveLength(5);
    expect(f[0].cells.map((c) => c.at)).toEqual([0, 0, 0]);
    expect(f.at(-1)!.cells.map((c) => c.at === c.total)).toEqual([true, true, true]);
    f.forEach((frame, j) => expect(frame.cells.map((c) => !!c.final)).toEqual(Array(3).fill(j === 4)));
    for (let b = 0; b < 3; b++) { const at = f.map((fr) => fr.cells[b].at); expect(at).toEqual([...at].sort((a, c) => a - c)); }
    expect(f[2].cells.map((c) => c.at)).toEqual(f[2].cells.map((c) => Math.round(c.total / 2)));
  });

  it('caps the frame count at the longest game and copes with games that never moved', () => {
    expect(grid([src('snake', 1, 3), src('snake', 2, 0)], 100)).toHaveLength(4);
    const one = grid([src('snake', 1, 0), src('snake', 2, 0)], 1);
    expect(one).toHaveLength(1);
    expect(one[0].cells.map((c) => c.at)).toEqual([0, 0]);
  });

  it('carries the heading on every frame', () => {
    expect(grid([src('snake', 1, 4, 'A'), src('snake', 1, 4, 'B')], 3).map((f) => f.title)).toEqual(Array(3).fill('A vs B on Snake'));
  });
});

describe('heading', () => {
  const t = (game: string, seed: number, name: string) => ({ game, seedCode: `${game}-${seed}`, entry: { name } });

  it('names the entries and the game when every board shares the game', () => {
    expect(heading([t('2048', 1, 'A'), t('2048', 1, 'B')])).toEqual({ title: 'A vs B on 2048', sub: 'same seed 2048-1' });
    expect(heading([t('2048', 1, 'A'), t('2048', 2, 'B')])).toEqual({ title: 'A vs B on 2048', sub: '' });
  });

  it('counts the tasks when every board shares the entry', () => {
    expect(heading([t('2048', 1, 'A'), t('snake', 1, 'A'), t('tetris', 1, 'A')])).toEqual({ title: 'A on 3 tasks', sub: '' });
  });

  it('falls back to a run count and calls a missing entry anonymous', () => {
    expect(heading([t('2048', 1, 'A'), t('snake', 1, 'B')]).title).toBe('2 runs');
    expect(heading([{ game: '2048', seedCode: 'x', entry: null }, t('2048', 1, 'B')]).title).toBe('Anonymous vs B on 2048');
  });
});
