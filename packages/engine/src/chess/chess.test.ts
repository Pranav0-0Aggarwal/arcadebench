import { describe, expect, it } from 'vitest';
import { drawInt } from '../core/rng.ts';
import { ending, parse, Pos, san, START, uci } from './board.ts';
import { accuracy, analyse, LEVELS, material, MATE, pickMove, think, tier, winPct } from './search.ts';

const KIWI = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const PERFT: [string, string, number[]][] = [
  ['start', START, [20, 400, 8902, 197281, 4865609]],
  ['kiwipete', KIWI, [48, 2039, 97862, 4085603]],
  ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['position 4 mirrored', 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1', [6, 264, 9467, 422333]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
  ['position 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890, 3894594]],
];
const moves = (fen: string) => Pos.fen(fen).legal().map(uci);

describe('perft', () => {
  it.each(PERFT)('%s matches the published node counts', (_, fen, counts) => {
    expect(counts.map((_, i) => Pos.fen(fen).perft(i + 1))).toEqual(counts);
  });
});

describe('rules', () => {
  it('writes and reads FEN', () => {
    for (const [, fen] of PERFT) expect(Pos.fen(fen).fen()).toBe(fen);
    expect(Pos.fen('rnbqkbnr/pppp1ppp/8/8/3Pp3/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 3').fen()).toContain(' d3 ');
  });

  it('castles only with the right, an empty path and no attacked square on the way', () => {
    expect(moves('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).toEqual(expect.arrayContaining(['e1g1', 'e1c1']));
    expect(moves('r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1')).not.toContain('e1g1');
    expect(moves('r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1')).toContain('e1c1');
    expect(moves('r3k2r/8/8/8/8/6r1/8/R3K2R w KQkq - 0 1')).not.toContain('e1g1');
    expect(moves('r3k2r/8/8/8/8/3r4/8/R3K2R w KQkq - 0 1')).not.toContain('e1c1');
    expect(moves('r3k2r/8/8/8/8/1r6/8/R3K2R w KQkq - 0 1')).toContain('e1c1');
    expect(moves('r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1')).not.toEqual(expect.arrayContaining(['e1g1']));
    expect(moves('r3k2r/8/8/8/8/8/8/R3K1NR w KQkq - 0 1')).not.toContain('e1g1');
    expect(moves('r3k2r/8/8/8/8/8/8/R3K2R w Qkq - 0 1')).not.toContain('e1g1');
    expect(moves('r3k2r/8/8/8/8/8/8/Rn2K2R w KQkq - 0 1')).not.toContain('e1c1');
  });

  it('moves the rook when castling and loses the right when a rook moves or is captured', () => {
    const p = Pos.fen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    p.make(parse(p, 'e1g1'));
    expect(p.fen()).toBe('r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
    p.make(parse(p, 'e8c8'));
    expect(p.fen()).toBe('2kr3r/8/8/8/8/8/8/R4RK1 w - - 2 2');
    const q = Pos.fen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    q.make(parse(q, 'h1h8'));
    expect(q.fen().split(' ')[2]).toBe('Qq');
  });

  it('handles en passant, including the capture that would expose the king along the rank', () => {
    const p = Pos.fen('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    expect(uci(p.legal().find((m) => uci(m) === 'e5d6')!)).toBe('e5d6');
    p.make(parse(p, 'e5d6'));
    expect(p.fen().split(' ')[0]).toBe('rnbqkbnr/ppp1pppp/3P4/8/8/8/PPPP1PPP/RNBQKBNR');
    p.unmake();
    expect(p.fen()).toBe('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    expect(moves('8/8/8/8/k2Pp2Q/8/8/4K3 b - d3 0 1')).not.toContain('e4d3');
    expect(moves('8/8/8/8/k2Pp3/8/8/4K3 b - d3 0 1')).toContain('e4d3');
    const d = Pos.fen(START);
    for (const m of ['e2e4', 'a7a6', 'e4e5', 'd7d5']) d.make(parse(d, m));
    expect(d.fen()).toContain(' d6 ');
    d.make(parse(d, 'g1f3'));
    d.make(parse(d, 'a6a5'));
    expect(d.fen()).not.toContain(' d6 ');
  });

  it('only records an en passant square when a pawn can take', () => {
    const p = Pos.fen(START);
    p.make(parse(p, 'e2e4'));
    expect(p.fen()).toContain(' - 0 1');
  });

  it('promotes to every piece, with and without capture, and forces a legal answer to check', () => {
    expect(moves('8/P7/8/8/8/8/8/k6K w - - 0 1').filter((m) => m.startsWith('a7')).sort()).toEqual(['a7a8b', 'a7a8n', 'a7a8q', 'a7a8r']);
    const cap = moves('1n6/P7/8/8/8/8/8/k6K w - - 0 1').filter((m) => m.startsWith('a7'));
    expect(cap).toHaveLength(8);
    expect(moves('1n6/2P5/8/8/8/8/8/k6K w - - 0 1').filter((m) => m.startsWith('c7'))).toHaveLength(8);
    const p = Pos.fen('8/P7/8/8/8/8/8/k6K w - - 0 1');
    p.make(parse(p, 'a7a8n'));
    expect(p.fen().split(' ')[0]).toBe('N7/8/8/8/8/8/8/k6K');
    p.unmake();
    expect(p.fen().split(' ')[0]).toBe('8/P7/8/8/8/8/8/k6K');
    expect(moves('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1').sort()).toEqual(['e1d1', 'e1e2', 'e1f1']);
    expect(moves('4k3/8/8/8/8/8/3n4/4K3 w - - 0 1')).toContain('e1e2');
  });

  it('keeps pinned pieces on their line', () => {
    expect(moves('4k3/8/8/8/8/8/4r3/4K1R1 w - - 0 1').filter((m) => m.startsWith('g1'))).toEqual([]);
    expect(moves('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1').filter((m) => m.startsWith('e2')).sort()).toEqual(['e2e3', 'e2e4', 'e2e5', 'e2e6', 'e2e7', 'e2e8']);
  });

  it('detects checkmate, stalemate, the fifty-move rule, threefold repetition and dead positions', () => {
    const fool = Pos.fen(START);
    for (const m of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) fool.make(parse(fool, m));
    expect(ending(fool)).toEqual({ why: 'checkmate', win: 1 });
    expect(ending(Pos.fen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toEqual({ why: 'stalemate', win: -1 });
    expect(ending(Pos.fen('7k/8/6K1/8/8/8/8/R7 w - - 99 80'))).toBeNull();
    expect(ending(Pos.fen('7k/8/6K1/8/8/8/8/R7 w - - 100 80'))).toEqual({ why: 'fifty', win: -1 });
    expect(ending(Pos.fen('7k/8/6K1/8/8/8/8/R6R w - - 100 80'))).toEqual({ why: 'fifty', win: -1 });
    const p = Pos.fen(START);
    for (const m of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) { expect(ending(p)).toBeNull(); p.make(parse(p, m)); }
    expect(ending(p)).toBeNull();
    for (const m of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) p.make(parse(p, m));
    expect(ending(p)).toEqual({ why: 'threefold', win: -1 });
    for (const [fen, dead] of [['8/8/4k3/8/8/4K3/8/8 w - - 0 1', true], ['8/8/4k3/8/8/4KB2/8/8 w - - 0 1', true], ['8/8/4k3/8/8/4KN2/8/8 w - - 0 1', true],
      ['8/8/4kb2/8/8/4KB2/8/8 w - - 0 1', false], ['8/8/4k1b1/8/8/4KB2/8/8 w - - 0 1', true], ['8/8/4k3/8/8/3NKN2/8/8 w - - 0 1', false], ['8/8/4k3/8/8/4KR2/8/8 w - - 0 1', false], ['8/8/4k3/8/8/4KP2/8/8 w - - 0 1', false]] as const) {
      expect(Pos.fen(fen).dead(), fen).toBe(dead);
    }
  });

  it('does not repeat across an irreversible move', () => {
    const p = Pos.fen(START);
    for (const m of ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'e2e4', 'e7e5', 'g1f3', 'g8f6', 'f3g1', 'f6g8']) p.make(parse(p, m));
    expect(p.rep(2)).toBe(false);
    expect(p.rep(1)).toBe(true);
  });

  it('writes SAN with disambiguation, captures, promotion, castling and check marks', () => {
    const s = (fen: string, u: string) => { const p = Pos.fen(fen); return san(p, parse(p, u)); };
    expect(s(START, 'g1f3')).toBe('Nf3');
    expect(s(START, 'e2e4')).toBe('e4');
    expect(s('4k3/8/8/8/8/8/8/N3K2N w - - 0 1', 'a1b3')).toBe('Nb3');
    expect(s('4k3/8/8/8/8/2N3N1/8/4K3 w - - 0 1', 'c3e4')).toBe('Nce4');
    expect(s('4k3/8/8/1N6/8/8/8/1N2K3 w - - 0 1', 'b1c3')).toBe('N1c3');
    expect(s('4k3/8/8/1N6/8/8/8/1N2K3 w - - 0 1', 'b5c3')).toBe('N5c3');
    expect(s('4k3/8/8/8/N1N5/8/8/4K3 w - - 0 1', 'a4b6')).toBe('Nab6');
    expect(s('4k3/8/8/8/8/Q1Q5/8/Q3K3 w - - 0 1', 'a3c1')).toBe('Qa3c1');
    expect(s('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'e4d5')).toBe('exd5');
    expect(s('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', 'e5d6')).toBe('exd6');
    expect(s('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7a8q')).toBe('a8=Q+');
    expect(s('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1')).toBe('O-O');
    expect(s('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1c1')).toBe('O-O-O');
    expect(s('3k4/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1c1')).toBe('O-O-O+');
    expect(s('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8')).toBe('Ra8#');
  });

  it('keeps the hash, FEN and board consistent through make and unmake', () => {
    for (const [, fen] of PERFT) {
      const p = Pos.fen(fen), start = p.fen();
      for (let i = 0; i < 60; i++) {
        const ms = p.legal();
        if (!ms.length) break;
        p.make(ms[drawInt(i, 3, i, ms.length)]);
        const q = Pos.fen(p.fen());
        expect([q.lo, q.hi, q.fen()]).toEqual([p.lo, p.hi, p.fen()]);
      }
      while (p.hist.length > 2) p.unmake();
      expect(p.fen()).toBe(start);
      expect([p.lo, p.hi]).toEqual([Pos.fen(start).lo, Pos.fen(start).hi]);
    }
  });
});

describe('engine', () => {
  const best = (fen: string, depth = 3) => uci(think(Pos.fen(fen), depth).move);
  it('finds mates and wins material', () => {
    expect(best('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', 2)).toBe('a1a8');
    expect(best('k7/8/1K6/8/8/8/8/7R w - - 0 1', 2)).toBe('h1h8');
    expect(best('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4')).toBe('h5f7');
    expect(best('4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1', 1)).toBe('c3d5');
    expect(best('4k3/8/8/8/8/8/4q3/4K3 w - - 0 1', 2)).toBe('e1e2');
  });

  it('does not leave a piece hanging when it can save it', () => {
    expect(best('4k3/8/8/3p4/4N3/8/8/4K3 w - - 0 1', 2)).not.toBe('e4c5');
    expect(best('r3k3/8/8/8/8/8/8/R3K3 w - - 0 1', 3)).toBe('a1a8');
  });

  it('grades every legal move deterministically and scores a mate above everything else', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', a = analyse(Pos.fen(fen)), b = analyse(Pos.fen(fen));
    expect([...a]).toEqual([...b]);
    expect([...a.keys()].map(uci).sort()).toEqual(moves(fen).sort());
    const top = [...a].sort((x, y) => y[1] - x[1])[0];
    expect([uci(top[0]), top[1] > MATE - 100]).toEqual(['a1a8', true]);
  });

  it('is fast enough to grade a middlegame move in well under a second', () => {
    const t = performance.now();
    for (const f of [KIWI, 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10']) analyse(Pos.fen(f));
    expect((performance.now() - t) / 2).toBeLessThan(400);
  });

  it('keeps pickMove legal and seeded, and plays random moves at the low levels', () => {
    const p = Pos.fen(KIWI), legal = p.legal();
    for (let l = 1; l <= 5; l++) expect(legal).toContain(pickMove(p, l, 5, 2));
    expect(pickMove(p, 2, 9, 4)).toBe(pickMove(p, 2, 9, 4));
    const picks = new Set(Array.from({ length: 40 }, (_, i) => pickMove(p, 1, 3, i)));
    expect(picks.size).toBeGreaterThan(1);
    expect(LEVELS.map((l) => l.elo)).toEqual([...LEVELS.map((l) => l.elo)].sort((x, y) => x - y));
  });

  const duel = (white: number, black: number, seed: number) => {
    const p = Pos.fen(START);
    for (let ply = 2; ply < 300; ply++) {
      const e = ending(p);
      if (e) return e.win < 0 ? 0.5 : +(e.win === 0);
      p.make(pickMove(p, p.turn ? black : white, seed, ply));
    }
    const m = material(p);
    return m > 300 ? 1 : m < -300 ? 0 : 0.5;
  };
  it('plays stronger at higher levels', () => {
    for (const [hi, lo] of [[2, 1], [3, 2], [4, 3]]) {
      let score = 0;
      for (let g = 0; g < 4; g++) score += duel(hi, lo, g) + 1 - duel(lo, hi, g + 17);
      expect(score / 8, `level ${hi} against ${lo}`).toBeGreaterThan(0.7);
    }
  });
});

describe('grading maths', () => {
  it('maps centipawns to win probability and loss to accuracy and tier', () => {
    expect(winPct(0)).toBeCloseTo(50, 6);
    expect(winPct(300)).toBeGreaterThan(winPct(100));
    expect(winPct(-300)).toBeCloseTo(100 - winPct(300), 6);
    expect(accuracy(0)).toBeCloseTo(100, 0);
    expect(accuracy(10)).toBeLessThan(accuracy(5));
    expect(accuracy(100)).toBe(0);
    expect([0, 4.9, 5, 10, 14.9, 15, 60].map(tier)).toEqual([0, 0, 1, 2, 2, 3, 3]);
  });
});
