export * from './core/types.ts';
export * from './core/rng.ts';
export * from './core/observe.ts';
export { makeSeedCode, readSeedCode } from './core/seedcode.ts';
export { ending, parse, Pos, san, sqName, sqOf, START, uci, type Ending } from './chess/board.ts';
export { analyse, accuracy, LEVELS, material, pickMove, tier, winPct } from './chess/search.ts';
export { grade, scores } from './chess/grade.ts';
export { ascii, replayLine, scene } from './chess/scene.ts';
import type { Game } from './core/types.ts';
import { makeSeedCode, readSeedCode } from './core/seedcode.ts';
import { tetris } from './games/tetris.ts';
import { g2048 } from './games/g2048.ts';
import { snake } from './games/snake.ts';
import { sokoban } from './games/sokoban.ts';
import { minesweeper } from './games/minesweeper.ts';
import { connect4 } from './games/connect4.ts';
import { chess } from './games/chess.ts';
import { dino } from './games/dino.ts';
import { lanes } from './games/lanes.ts';
import { shifting } from './games/shifting.ts';
import { beams } from './games/beams.ts';
import { courier } from './games/courier.ts';
import { sorter } from './games/sorter.ts';
import { switchboard } from './games/switchboard.ts';
import { checkpoint } from './games/checkpoint.ts';

const classics = [tetris, g2048, snake, sokoban, minesweeper, connect4, dino, lanes] as const;
const originals = [shifting, beams, courier] as const;
const lab = [sorter, switchboard, checkpoint] as const;
const duels = [chess] as const;

export type GameId = (typeof classics | typeof originals | typeof lab | typeof duels)[number]['id'];
export const CLASSICS: Game<any>[] = [...classics];
export const ORIGINALS: Game<any>[] = [...originals];
export const LAB: Game<any>[] = [...lab];
export const DUELS: Game<any>[] = [...duels];
export const GAMES: Record<string, Game<any>> = Object.fromEntries([...CLASSICS, ...ORIGINALS, ...LAB, ...DUELS].map((g) => [g.id, g]));

export const CAPS: Record<string, number> = Object.fromEntries(Object.values(GAMES).map((g) => [g.id, g.maxSteps]));

const major = (g: Game<any>) => +g.version.split('.')[0];
export const seedCodeOf = (game: string, seed: number) => makeSeedCode(GAMES[game].prefix, major(GAMES[game]), seed);
export function parseSeedCode(code: string): { game: string; seed: number } | null {
  const byPrefix = Object.fromEntries(Object.values(GAMES).map((g) => [g.prefix, g]));
  const r = readSeedCode(code, (p) => (byPrefix[p] ? major(byPrefix[p]) : undefined));
  return r ? { game: byPrefix[r.prefix].id, seed: r.seed } : null;
}
