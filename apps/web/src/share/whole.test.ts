import { describe, expect, it } from 'vitest';
import type { MatchLive, SeatInfo } from '@arcadebench/api';
import { GAMES, replayLine } from '@arcadebench/engine';
import type { Clip, Grid } from './clip.ts';
import { ended, frames, heading, matchSource, type Source } from './whole.ts';

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

const seat = (name: string): SeatInfo => ({ kind: 'human', name, joined: true, elo: null });
const MATE = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
const done = (white: string, black: string): MatchLive => ({ white: seat(white), black: seat(black), status: 'done', result: '0-1', why: 'checkmate', draw: null, sans: ['f3', 'e5', 'g4', 'Qh4#'], accuracy: [20, 90], grades: [null, null, { best: 'e2e4', cp: -900, bestCp: 20, loss: 40, accuracy: 10, tier: 3 }, null], deadline: null });

describe('match sources', () => {
  const src = matchSource(done('Ada', 'Bob'), MATE);

  it('replays the move line with the players as the heading and no seed', () => {
    expect(src).toMatchObject({ game: 'chess', who: 'Ada vs Bob', seedCode: '', entry: { name: 'Ada vs Bob' } });
    const f = frames(src, 10) as Clip[], line = replayLine(MATE);
    expect(f).toHaveLength(4);
    expect(f.map((c) => c.at)).toEqual([1, 2, 3, 4]);
    expect(f.map((c) => (c.data as { board: string[] }).board)).toEqual(line.slice(1).map((s) => s.board));
    expect(f[0]).toMatchObject({ title: 'Chess', who: 'Ada vs Bob', seedCode: '', total: 4 });
  });

  it('shows the result banner and the final accuracy only on the last frame', () => {
    const f = frames(src, 10) as Clip[], d = f.map((c) => c.data as { say: string; verdict: string; accs: (number | null)[] });
    expect(f.map((c) => !!c.final)).toEqual([false, false, false, true]);
    expect(d.map((x) => x.say)).toEqual(['', '', '', 'Black wins · checkmate']);
    expect(d.map((x) => x.verdict)).toEqual(['playing', 'playing', 'playing', '0-1']);
    expect(d[3].accs).toEqual([10, null]);
    expect(f[3].score).toBe(0);
  });

  it('samples long games down to the frame budget', () => {
    const f = frames(src, 2) as Clip[];
    expect(f.map((c) => c.at)).toEqual([1, 4]);
  });

  it('ends on the final position for the grid and names the players', () => {
    expect(ended(src)).toMatchObject({ step: 4, score: 0, match: { result: '0-1' } });
    const g = frames([src, matchSource(done('Cy', 'Di'), MATE)], 3) as Grid[];
    expect(g.map((x) => x.title)).toEqual(Array(3).fill('Ada vs Bob · Cy vs Di on Chess'));
    expect(g[2].cells.map((c) => (c.data as { say: string }).say)).toEqual(Array(2).fill('Black wins · checkmate'));
    expect(g[0].sub).toBe('');
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
