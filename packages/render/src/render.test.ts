import { describe, expect, it } from 'vitest';
import { drawInt, expertAction, GAMES } from '@arcadebench/engine';
import { draw, hit, ratio, type G } from './index.ts';

function mock() {
  const calls = { n: 0 };
  const props: Record<string, unknown> = {};
  const g = new Proxy(props, {
    get: (t, k: string) => k === 'measureText' ? () => ({ width: 10 }) : k in t ? t[k] : (...a: unknown[]) => {
      calls.n++;
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
  });
});
