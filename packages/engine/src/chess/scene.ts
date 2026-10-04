import { parse, Pos, sqName, START, SYM } from './board.ts';

const board = (p: Pos) => Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, f) => SYM[p.b[(7 - i) * 16 + f]]).join(''));
function lost(p: Pos, c: number) {
  const have = Array<number>(7).fill(0);
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const x = p.b[r * 16 + f]; if (x && x >> 3 === c) have[x & 7]++; }
  return [8, 2, 2, 2, 1].flatMap((n, i) => SYM[(i + 1) | (c << 3)].repeat(Math.max(0, n - have[i + 1]))).join('');
}

export const scene = (p: Pos, last: string) => ({ fen: p.fen(), board: board(p), turn: p.turn ? 'b' : 'w', last, check: p.check() ? sqName(p.k[p.turn]) : '', lost: { w: lost(p, 0), b: lost(p, 1) } });
export const ascii = (p: Pos) => board(p).map((r, i) => `${8 - i} ${[...r].join(' ')}`).join('\n') + '\n  a b c d e f g h';

export function replayLine(moves: string[]) {
  const p = Pos.fen(START), out = [scene(p, '')];
  for (const m of moves) {
    const x = parse(p, m);
    if (x < 0) break;
    p.make(x);
    out.push(scene(p, m));
  }
  return out;
}
