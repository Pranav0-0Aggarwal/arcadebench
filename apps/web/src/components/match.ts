import type { MatchLive, MoveGrade, SeatInfo } from '@arcadebench/api';
import { parse, Pos, san } from '@arcadebench/engine';

type Scene = Record<string, unknown>;

export const MARK = ['', '?!', '?', '??'];
export const TIER = ['', 'Inaccuracy', 'Mistake', 'Blunder'];
export const cap = (c: string) => c[0].toUpperCase() + c.slice(1);
export const seatName = (s: SeatInfo) => s.name ?? 'Open seat';
export const matchTitle = (m: Pick<MatchLive, 'white' | 'black'>) => `${seatName(m.white)} vs ${seatName(m.black)}`;
export const matchEntry = (m: Pick<MatchLive, 'white' | 'black'>) => ({ name: matchTitle(m) });
export const kindOf = (s: SeatInfo) => (s.kind === 'agent' ? 'AI agent' : s.kind === 'computer' ? 'built-in engine' : 'human');
export const say = (m: Pick<MatchLive, 'result' | 'why'>) => `${m.result === '1-0' ? 'White wins' : m.result === '0-1' ? 'Black wins' : 'Draw'} · ${m.why}`;
export const points = (m: Pick<MatchLive, 'result'>) => (m.result === '1-0' ? 1 : m.result === '1/2-1/2' ? 0.5 : 0);
export const moves = (plies: number) => `${Math.ceil(plies / 2)} moves`;
export const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);

export function sanOf(fen: string, move: string) {
  const p = Pos.fen(fen), m = parse(p, move);
  return m < 0 ? move : san(p, m);
}

const mean = (gs: (MoveGrade | null)[], c: number) => { const v = gs.flatMap((g, i) => (g && i % 2 === c ? [g.accuracy] : [])); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

export function matchData(s: Scene, m: MatchLive, i: number, last: boolean) {
  const over = last && m.result !== null, gs = m.grades.slice(0, i);
  return { ...s, you: 'w', moves: (i >> 1) + 1, accs: [mean(gs, 0), mean(gs, 1)], acc: null, verdict: over ? m.result : 'playing', why: over ? m.why : '', say: over ? say(m) : '' };
}
