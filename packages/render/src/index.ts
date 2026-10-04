import type { GameId } from '@arcadebench/engine';
import type { G, Opts, Renderer } from './frame.ts';
import { beams } from './games/beams.ts';
import { connect4 } from './games/connect4.ts';
import { checkpoint } from './games/checkpoint.ts';
import { courier } from './games/courier.ts';
import { dino } from './games/dino.ts';
import { g2048 } from './games/g2048.ts';
import { lanes } from './games/lanes.ts';
import { minesweeper } from './games/minesweeper.ts';
import { shifting } from './games/shifting.ts';
import { snake } from './games/snake.ts';
import { sorter } from './games/sorter.ts';
import { sokoban } from './games/sokoban.ts';
import { switchboard } from './games/switchboard.ts';
import { tetris } from './games/tetris.ts';

export { C as COLORS } from './frame.ts';
export type { G, Opts } from './frame.ts';

const RENDERERS: Record<string, Renderer> = { tetris, '2048': g2048, snake, sokoban, minesweeper, connect4, dino, lanes, shifting, beams, courier, sorter, switchboard, checkpoint } satisfies Record<GameId, Renderer>;

export const draw = (g: G, game: string, data: unknown, w: number, h: number, o: Opts = {}) => RENDERERS[game].draw(g, data, w, h, o);
export const hit = (game: string, data: unknown, w: number, h: number, x: number, y: number) => RENDERERS[game].hit?.(data, w, h, x, y) ?? null;
export const ratio = (game: string) => { const [c, r] = RENDERERS[game].dims; return (c * 20 + 20) / (r * 20 + 42); };

export function fit(c: HTMLCanvasElement) {
  const r = c.getBoundingClientRect(), k = devicePixelRatio || 1, W = Math.max(1, Math.round(r.width * k)), H = Math.max(1, Math.round(r.height * k));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext('2d')!;
  g.setTransform(k, 0, 0, k, 0, 0);
  return { g, w: r.width, h: r.height };
}
export * from './stats.ts';
