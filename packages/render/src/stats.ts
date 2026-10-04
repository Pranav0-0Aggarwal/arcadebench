import type { GameId } from '@arcadebench/engine';
type Row = [string, string];
export interface Stats { head: Row; rows: Row[]; badge?: string }

export const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-US') : String(+v.toFixed(2)));
const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);
const acc = (d: any) => (d.answered ? `${Math.round((100 * d.correct) / d.answered)}%` : '–');
type Fn = (d: any, score: number) => Stats;
const STATS: Record<string, Fn> = {
  '2048': (d, s) => { const best = Math.max(...d.board.flat()); return { head: ['score', fmt(s)], rows: [['best tile', fmt(best)], ['moves', fmt(d.moves)]], badge: best >= 2048 ? '2048!' : undefined }; },
  tetris: (d) => ({ head: ['lines', fmt(d.lines)], rows: [['pieces', fmt(d.pieces)]] }),
  snake: (d) => ({ head: ['apples', fmt(d.apples)], rows: [['length', fmt(d.body.length)], ['steps', fmt(d.steps)]] }),
  sokoban: (d, s) => ({ head: ['score', `${fmt(s)}/400`], rows: [['puzzle', `${Math.min(d.puzzle, 4)}/4`], ['moves', fmt(d.moves)]] }),
  minesweeper: (d) => ({ head: ['safe cells', `${d.revealed}/216`], rows: [['result', d.lost ? 'hit a mine' : d.revealed >= 216 ? 'cleared' : 'playing']], badge: d.revealed >= 216 ? 'Cleared!' : undefined }),
  connect4: (d, s) => { const r: number[] = d.results; return { head: ['points', `${fmt(s)}/6`], rows: [['match', `${r.filter((x) => x === 1).length}W ${r.filter((x) => x === 0.5).length}D ${r.filter((x) => x === 0).length}L`], ['game', `${Math.min(d.game, 6)}/6`]] }; },
  chess: (d) => ({ head: ['result', d.verdict], rows: d.accs ? [['white', pct(d.accs[0])], ['black', pct(d.accs[1])], ['moves', fmt(d.moves)]] : [['accuracy', pct(d.acc)], ['blunders', fmt(d.tiers[2])], ['moves', fmt(d.moves)]] }),
  dino: (d) => ({ head: ['score', String(d.score).padStart(5, '0')], rows: [['speed', `${d.speedPxPerFrame.toFixed(1)} px/f`]] }),
  lanes: (d, s) => ({ head: ['score', fmt(s)], rows: [['rows', fmt(d.row)], ['coins', fmt(d.coins)]] }),
  shifting: (d, s) => ({ head: ['score', fmt(s)], rows: [['step', `${d.steps}/200`]] }),
  beams: (d, s) => ({ head: ['score', `${fmt(s)}/300`], rows: [['puzzle', `${Math.min(d.puzzle, 3)}/3`], ['beams lit', `${d.lit}/2`]] }),
  courier: (d, s) => ({ head: ['score', fmt(s)], rows: [['delivered', fmt(d.delivered)], ['on time', fmt(d.onTime)]] }),
  sorter: (d) => ({ head: ['accuracy', acc(d)], rows: [['spam caught', fmt(d.caught)], ['false alarms', fmt(d.falseAlarms)]] }),
  checkpoint: (d) => ({ head: ['accuracy', acc(d)], rows: [['fraud caught', fmt(d.caught)], ['false flags', fmt(d.falseFlags)]] }),
  switchboard: (d) => ({ head: ['accuracy', acc(d)], rows: [['correct calls', `${d.correct}/${d.answered}`]] }),
} satisfies Record<GameId, Fn>;

export const stats = (game: string, data: unknown, score: number): Stats => STATS[game]?.(data, score) ?? { head: ['score', fmt(score)], rows: [] };
