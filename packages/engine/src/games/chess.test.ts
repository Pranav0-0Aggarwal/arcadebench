import { describe, expect, it } from 'vitest';
import { gameContract } from '../core/contract.ts';
import { observe } from '../core/observe.ts';
import { START } from '../chess/board.ts';
import { chess, type ChessState } from './chess.ts';

const at = (fen: string, extra: Partial<ChessState> = {}): ChessState => ({ ...chess.init(0), fen, reps: [], last: '', san: '', ...extra });

describe('chess', () => {
  gameContract(chess, { seeds: 6, margin: 0.5, ratio: 3 });

  it('lets the seed pick the colour, and the engine opens when you are Black', () => {
    const w = chess.init(0), b = chess.init(1);
    expect([w.you, w.fen, w.san]).toEqual([0, START, '']);
    expect(b.you).toBe(1);
    expect(b.fen).not.toBe(START);
    expect(b.fen.split(' ')[1]).toBe('b');
    expect(chess.legal(b).length).toBeGreaterThan(0);
    expect(chess.render(b)).toContain('You play Black');
  });

  it('plays the engine reply inside the step and keeps unique UCI ids with SAN labels', () => {
    const s = chess.init(0), s2 = chess.step(s, 'e2e4');
    expect(s2.fen.split(' ')[1]).toBe('w');
    expect(s2.n).toBe(1);
    expect(s2.fen).not.toBe(chess.step(s, 'd2d4').fen);
    expect(chess.label!(s, 'g1f3')).toBe('Nf3');
    expect(chess.label!(s, 'e2e4')).toBe('e4');
    expect(() => chess.step(s, 'e2e5')).toThrow(/illegal/);
    expect(() => chess.step(s, 'E2E4')).toThrow(/illegal/);
    const o = observe(chess, s, 2);
    expect(o.actions).toHaveLength(20);
    expect(o.actions.every((a) => a.outcome === undefined)).toBe(true);
    expect(observe(chess, s, 1).actions.find((a) => a.id === 'g1f3')!.features).toEqual({ capture: 0, check: 0, attacked: 0, promotion: 0 });
    expect(o.text).toContain('FEN: ' + START);
    expect(o.text).toContain('8 r n b q k b n r');
  });

  it('ends on checkmate with a win and a full accuracy credit, and stops offering moves', () => {
    const s = chess.step(at('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', { you: 0 }), 'a1a8');
    expect([s.res, s.why, chess.done(s), chess.legal(s)]).toEqual([1, 'checkmate', true, []]);
    expect(chess.score(s)).toBeGreaterThan(1.2);
    expect(() => chess.step(s, 'e1e2')).toThrow();
  });

  it('credits accuracy even in a lost game, and grades blunders', () => {
    const s = chess.step(at('r3k3/8/8/8/8/8/8/Q3K3 w - - 0 1', { you: 0 }), 'a1a7');
    expect(s.tiers[2]).toBe(1);
    expect(chess.score(s)).toBeLessThan(0.1);
    expect(chess.score(chess.init(0))).toBe(0);
  });

  it('grades against the engine and treats a move into a repeated position as a draw', () => {
    const v = chess.values(chess.init(0));
    expect(Object.keys(v)).toHaveLength(20);
    expect(Math.max(...Object.values(v))).toBeLessThan(60);
    const p = at('4k3/8/8/8/8/8/8/R3K3 w - - 4 9', { reps: [] });
    expect(Math.max(...Object.values(chess.values(p)))).toBeGreaterThan(50);
  });

  it('adjudicates by material after the move cap, and counts an unfinished game as a loss', () => {
    const lead = chess.step(at('4k3/8/8/8/8/8/8/Q3K2R w - - 0 60', { you: 0, n: 149 }), 'h1h2');
    expect([lead.res, lead.why]).toEqual([1, 'adjudicated']);
    const level = chess.step(at('4k2r/8/8/8/8/8/8/R3K3 w - - 0 60', { you: 0, n: 149 }), 'a1a2');
    expect(level.res).toBe(0.5);
    expect(chess.score(chess.init(0))).toBeLessThan(chess.score({ ...chess.init(0), res: 0.5 }));
  });

  it('describes the board for the canvas', () => {
    const d = chess.data(chess.step(chess.init(0), 'e2e4')) as { board: string[]; turn: string; you: string; lost: { w: string; b: string }; level: number };
    expect(d.board).toHaveLength(8);
    expect([d.turn, d.you, d.level]).toEqual(['w', 'w', 3]);
    const x = chess.data(at('4k3/8/8/8/8/8/8/4KQ2 w - - 0 1')) as { lost: { w: string; b: string } };
    expect(x.lost).toEqual({ w: 'PPPPPPPPNNBBRR', b: 'ppppppppnnbbrrq' });
  });
});
