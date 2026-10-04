import { illegal, type Game } from '../core/types.ts';
import { ending, parse, Pos, san, sqName, START, uci } from '../chess/board.ts';
import { grade, scores } from '../chess/grade.ts';
import { ascii, scene } from '../chess/scene.ts';
import { accuracy, LEVELS, material, pickMove, tier, winPct } from '../chess/search.ts';

export const LEVEL = 3;
const MAX = 150, WEIGHT = 0.25, LEAD = 300, VALUE = [0, 1, 3, 3, 5, 9, 0], L = LEVELS[LEVEL - 1];
export interface ChessState { seed: number; you: number; fen: string; reps: number[]; n: number; graded: number; acc: number; tiers: number[]; last: string; san: string; res: number | null; why: string }

const VERDICT = ['lost', 'draw', 'won'], PIECE = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const play = (p: Pos, m: number) => { const name = san(p, m); p.make(m); return name; };

function land(s: ChessState, p: Pos, m: number, name: string, extra: Partial<ChessState> = {}): ChessState {
  const e = ending(p);
  return { ...s, ...extra, fen: p.fen(), reps: p.hist.slice(-2 * (p.half + 1)), last: uci(m), san: name, res: e ? (e.win < 0 ? 0.5 : +(e.win === s.you)) : null, why: e?.why ?? '' };
}
function answer(s: ChessState, p: Pos): ChessState {
  if (s.res !== null) return s;
  const m = pickMove(p, LEVEL, s.seed, p.full * 2 + p.turn);
  return land(s, p, m, play(p, m));
}
export const chess: Game<ChessState, 'chess'> = {
  id: 'chess', prefix: 'CHS', name: 'Chess', version: '1.1.0', realtime: null, maxSteps: MAX, hidesOutcomes: true, ask: 'Which move is best for you in this position?',
  rules: `Chess against a computer opponent (level ${LEVEL} of 5: it searches ${L.depth} plies and plays a random move ${Math.round(L.noise * 100)}% of the time). The seed decides your colour. Every action is a legal move in UCI notation: e2e4, g1f3, e1g1 to castle, e7e8q to promote to a queen (r, b or n for the other pieces); the opponent answers each move. Standard rules apply, including castling, en passant, checkmate, stalemate and the threefold repetition, fifty-move and insufficient material draws. Score is win 1, draw 0.5, loss 0, plus up to ${WEIGHT} for the average accuracy of your moves against the engine, so good moves earn credit even in a lost game. After ${MAX} of your moves the game is adjudicated: a lead of three pawns or more wins.`,
  init(seed) {
    const p = Pos.fen(START), s: ChessState = { seed, you: seed % 2, fen: START, reps: [...p.hist], n: 0, graded: 0, acc: 0, tiers: [0, 0, 0], last: '', san: '', res: null, why: '' };
    return s.you ? answer(s, p) : s;
  },
  legal: (s) => (s.res === null ? Pos.fen(s.fen).legal().map(uci) : []),
  step(s, a) {
    const p = Pos.fen(s.fen, s.reps), ms = p.legal(), m = ms.find((x) => uci(x) === a);
    if (s.res !== null || m === undefined) illegal('chess', a, chess.legal(s));
    let acc = s.acc, graded = s.graded;
    const tiers = [...s.tiers];
    if (ms.length > 1) {
      const { loss } = grade(s.fen, s.reps, a), t = tier(loss);
      acc += accuracy(loss); graded++;
      if (t) tiers[t - 1]++;
    }
    let t = answer(land(s, p, m, play(p, m), { acc, graded, tiers, n: s.n + 1 }), p);
    if (t.res === null && t.n >= MAX) { const lead = (s.you ? -1 : 1) * material(p); t = { ...t, res: lead >= LEAD ? 1 : lead <= -LEAD ? 0 : 0.5, why: 'adjudicated' }; }
    return t;
  },
  done: (s) => s.res !== null,
  score: (s) => (s.res ?? 0) + (s.graded ? (WEIGHT * s.acc) / s.graded / 100 : 0),
  render(s) {
    const p = Pos.fen(s.fen);
    return `${ascii(p)}\nFEN: ${s.fen}\nYou play ${s.you ? 'Black' : 'White'}. ${s.res === null ? `Your move (move ${p.full}).` : 'The game is over.'}${s.san ? ` Last move: ${s.san}.` : ''}${s.res === null && p.check() ? ' You are in check.' : ''}${s.res === null ? '' : ` Result: ${s.res === 1 ? 'you won' : s.res === 0 ? 'you lost' : 'draw'} (${s.why}).`}`;
  },
  data(s) {
    const p = Pos.fen(s.fen);
    return { ...scene(p, s.last), you: s.you ? 'b' : 'w', res: s.res, why: s.why, verdict: s.res === null ? 'playing' : VERDICT[s.res * 2], say: s.res === null ? '' : `${['You lost', 'Draw', 'You won'][s.res * 2]} · ${s.why}`, acc: s.graded ? s.acc / s.graded : null, tiers: s.tiers, moves: s.n, level: LEVEL };
  },
  label(s, a) {
    const p = Pos.fen(s.fen), m = parse(p, a), from = m & 127, to = (m >> 7) & 127, kind = p.b[from] & 7, name = san(p, m);
    const took = p.b[to] & 7 || (kind === 1 && to === p.ep ? 1 : 0), castle = kind === 6 && Math.abs(to - from) === 2;
    p.make(m);
    const say = [castle ? `castles ${to > from ? 'kingside' : 'queenside'}` : `${PIECE[kind]} ${sqName(from)} to ${sqName(to)}`];
    if (took) say.push(`takes a ${PIECE[took]}`);
    if (m >> 14) say.push(`promotes to a ${PIECE[(m >> 14) & 7]}`);
    if (p.check()) say.push(p.legal().length ? 'gives check' : 'checkmate');
    else if (p.att(to, p.turn)) say.push('lands where it can be taken');
    return `${name} (${say.join(', ')})`;
  },
  values: (s) => Object.fromEntries(Object.entries(scores(s.fen, s.reps)).map(([a, cp]) => [a, winPct(cp)])),
  valuesExact: false,
};
