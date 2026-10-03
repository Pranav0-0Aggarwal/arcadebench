export * from './core/types.ts';
export * from './core/rng.ts';
export * from './core/observe.ts';
export { makeSeedCode, readSeedCode } from './core/seedcode.ts';
import type { Game } from './core/types.ts';
import { makeSeedCode, readSeedCode } from './core/seedcode.ts';
import { tetris } from './games/tetris.ts';
import { g2048 } from './games/g2048.ts';
import { snake } from './games/snake.ts';
import { sokoban } from './games/sokoban.ts';
import { minesweeper } from './games/minesweeper.ts';
import { connect4 } from './games/connect4.ts';
import { dino } from './games/dino.ts';
import { lanes } from './games/lanes.ts';
import { shifting } from './games/shifting.ts';
import { beams } from './games/beams.ts';
import { courier } from './games/courier.ts';

export const CLASSICS = [tetris, g2048, snake, sokoban, minesweeper, connect4, dino, lanes] as Game<any>[];
export const ORIGINALS = [shifting, beams, courier] as Game<any>[];
export const GAMES: Record<string, Game<any>> = Object.fromEntries([...CLASSICS, ...ORIGINALS].map((g) => [g.id, g]));

/** step caps used in the paper, identical for every agent so normalization stays consistent */
export const PAPER_CAPS: Record<string, number> = { tetris: 100, '2048': 300, snake: 600, sokoban: 240, minesweeper: 216, connect4: 126, dino: 6000, lanes: 400, shifting: 200, beams: 64, courier: 300 };

const major = (g: Game<any>) => +g.version.split('.')[0];
export const seedCodeOf = (game: string, seed: number) => makeSeedCode(GAMES[game].prefix, major(GAMES[game]), seed);
export function parseSeedCode(code: string): { game: string; seed: number } | null {
  const byPrefix = Object.fromEntries(Object.values(GAMES).map((g) => [g.prefix, g]));
  const r = readSeedCode(code, (p) => (byPrefix[p] ? major(byPrefix[p]) : undefined));
  return r ? { game: byPrefix[r.prefix].id, seed: r.seed } : null;
}
