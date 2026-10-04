import { describe, expect, it } from 'vitest';
import { drawInt, expertAction, GAMES } from '@arcadebench/engine';
import { draw, hit, ratio, stats, type G } from './index.ts';

function mock() {
  const calls = { n: 0, text: [] as string[] };
  const props: Record<string, unknown> = {};
  const g = new Proxy(props, {
    get: (t, k: string) => k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : (...a: unknown[]) => {
      calls.n++;
      if (k === 'fillText') calls.text.push(String(a[0]));
      for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${k}: non-finite argument`);
    },
    set: (t, k: string, v) => { t[k] = v; return true; },
  });
  return { g: g as unknown as G, calls };
}

describe.each(Object.keys(GAMES))('%s', (id) => {
  const game = GAMES[id];
  it('draws the initial state and the state after 20 random steps, with and without intent', () => {
    let s = game.init(3);
    for (let i = 0; i < 21; i++) {
      for (const intent of [undefined, expertAction(game, s), game.legal(s)[0]]) {
        const { g, calls } = mock();
        expect(() => draw(g, id, game.data(s), 320, 240, { t: i * 40, intent })).not.toThrow();
        expect(calls.n).toBeGreaterThan(10);
      }
      if (game.done(s) || i === 20) break;
      const legal = game.legal(s);
      s = game.step(s, legal[drawInt(3, 77, i, legal.length)]);
    }
  });
  it('survives a tiny canvas', () => {
    const { g } = mock();
    expect(() => draw(g, id, game.data(game.init(1)), 8, 8)).not.toThrow();
  });
  it('has a usable aspect ratio', () => expect(ratio(id)).toBeGreaterThan(.4));
  it('summarises the initial and a played state for the share cards', () => {
    let s = game.init(3);
    for (let i = 0; i < 5; i++) {
      const { head, rows } = stats(id, game.data(s), game.score(s));
      expect([head, ...rows].flat().every((t) => t.length > 0 && !/NaN|undefined/.test(t))).toBe(true);
      s = game.step(s, game.legal(s)[0]);
    }
  });
});

describe('pointing', () => {
  it('maps a click to the cell, column or mirror under it', () => {
    const w = 400, h = 442;
    expect(hit('minesweeper', {}, w, h, 200, 221)).toMatch(/^r\d+c\d+$/);
    expect(hit('minesweeper', {}, w, h, 2, 2)).toBeNull();
    expect(hit('connect4', {}, w, h, 200, 221)).toMatch(/^c[0-6]$/);
    const s = GAMES.beams.init(5), d = GAMES.beams.data(s) as { mirrors: { at: [number, number] }[] };
    const f = (400 - 20) / 8, [mx, my] = d.mirrors[0].at;
    expect(hit('beams', d, 400, 22 + 20 + 8 * f, (mx + 1.5) * f + 10, 22 + 10 + (my + 1.5) * f)).toBe('flip0');
    expect(hit('tetris', {}, w, h, 5, 5)).toBeNull();
    expect([hit('sorter', {}, w, h, 100, 300), hit('sorter', {}, w, h, 300, 300), hit('checkpoint', {}, w, h, 300, 300)]).toEqual(['inbox', 'spam', 'flag']);
    const sw = GAMES.switchboard.data(GAMES.switchboard.init(2)) as { item: { fns: { name: string }[] } };
    expect(hit('switchboard', sw, w, 22 + 12 * 20 + 20, 200, 32 + 20 * 3.3 + 10)).toBe(sw.item.fns[0].name);
  });
});

describe('transient overlays', () => {
  const said = (game: string, data: unknown, o: object) => { const { g, calls } = mock(); draw(g, game, data, 400, 442, o); return calls.text.join(' '); };
  it('shows a Tetris line clear only right after it happens', () => {
    const d = { ...(GAMES.tetris.data(GAMES.tetris.init(1)) as object), clear: { rows: [19], board: Array(20).fill('IIIIIIIIII') } };
    expect(said('tetris', d, { age: 100 })).toContain('+1 line');
    expect(said('tetris', d, { age: 900 })).not.toContain('+1 line');
    expect(said('tetris', d, {})).toContain('+1 line');
  });
  it('shows the finished Connect Four game and its result, then the new board', () => {
    let s = GAMES.connect4.init(2);
    while (s.results.length === 0) s = GAMES.connect4.step(s, GAMES.connect4.legal(s)[0]);
    const d = GAMES.connect4.data(s);
    expect(said('connect4', d, { age: 0 })).toMatch(/(You win|Engine wins|Draw) · game 1 of 6/);
    expect(said('connect4', d, { age: 5000 })).not.toContain('game 1 of 6');
  });
  it('stamps the verdict on the last answer only right after it', () => {
    const s = GAMES.checkpoint.step(GAMES.checkpoint.init(1), 'flag'), d = GAMES.checkpoint.data(s);
    expect(said('checkpoint', d, { age: 100 })).toMatch(/CAUGHT|FALSE ALARM/);
    expect(said('checkpoint', d, { age: 5000 })).not.toMatch(/CAUGHT|FALSE ALARM/);
    expect(said('sorter', GAMES.sorter.data(GAMES.sorter.step(GAMES.sorter.init(1), 'spam')), { age: 100 })).toMatch(/\+1|oops/);
  });
  it('counts flags against the mines left', () => {
    expect(said('minesweeper', GAMES.minesweeper.data(GAMES.minesweeper.init(1)), { marks: ['r15c15', 'r14c15'] })).toContain('38');
  });
});
