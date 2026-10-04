type Row = [string, string];
export interface Stats { head: Row; rows: Row[]; badge?: string }

const n = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-US') : String(+v.toFixed(2)));
const STATS: Record<string, (d: any, score: number) => Stats> = {
  '2048': (d, s) => { const best = Math.max(...d.board.flat()); return { head: ['score', n(s)], rows: [['best tile', n(best)], ['moves', n(d.moves)]], badge: best >= 2048 ? '2048!' : undefined }; },
  tetris: (d) => ({ head: ['lines', n(d.lines)], rows: [['pieces', n(d.pieces)]] }),
  snake: (d) => ({ head: ['apples', n(d.apples)], rows: [['length', n(d.body.length)], ['steps', n(d.steps)]] }),
  sokoban: (d, s) => ({ head: ['score', `${n(s)}/400`], rows: [['puzzle', `${Math.min(d.puzzle, 4)}/4`], ['moves', n(d.moves)]] }),
  minesweeper: (d) => ({ head: ['safe cells', `${d.revealed}/216`], rows: [['result', d.lost ? 'hit a mine' : d.revealed >= 216 ? 'cleared' : 'playing']], badge: d.revealed >= 216 ? 'Cleared!' : undefined }),
  connect4: (d, s) => { const r: number[] = d.results; return { head: ['points', `${n(s)}/6`], rows: [['match', `${r.filter((x) => x === 1).length}W ${r.filter((x) => x === 0.5).length}D ${r.filter((x) => x === 0).length}L`], ['game', `${Math.min(d.game, 6)}/6`]] }; },
  dino: (d) => ({ head: ['score', String(d.score).padStart(5, '0')], rows: [['speed', `${d.speedPxPerFrame.toFixed(1)} px/f`]] }),
  lanes: (d, s) => ({ head: ['score', n(s)], rows: [['rows', n(d.row)], ['coins', n(d.coins)]] }),
  shifting: (d, s) => ({ head: ['score', n(s)], rows: [['step', `${d.steps}/200`]] }),
  beams: (d, s) => ({ head: ['score', `${n(s)}/300`], rows: [['puzzle', `${Math.min(d.puzzle, 3)}/3`], ['beams lit', `${d.lit}/2`]] }),
  courier: (d, s) => ({ head: ['score', n(s)], rows: [['delivered', n(d.delivered)], ['on time', n(d.onTime)]] }),
};

export const stats = (game: string, data: unknown, score: number): Stats => STATS[game]?.(data, score) ?? { head: ['score', n(score)], rows: [] };
