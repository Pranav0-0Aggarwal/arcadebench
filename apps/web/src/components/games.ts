import { CLASSICS, LAB, ORIGINALS, type GameId } from '@arcadebench/engine';

export interface Meta { skills: string; cap: string; expert: string; data?: string; pace?: number }

export const GROUPS = [['Classics', CLASSICS], ['ArcadeBench originals', ORIGINALS], ['Decision Lab', LAB]] as const;

export const COUNT = { arcade: CLASSICS.length + ORIGINALS.length, lab: LAB.length };

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
export const words = (n: number, up = false) => { const w = WORDS[n] ?? String(n); return up ? w[0].toUpperCase() + w.slice(1) : w; };

export const META: Record<string, Meta> = {
  tetris: { skills: 'spatial, planning', cap: '1,000 pieces', expert: 'El-Tetris weights, 2-ply over the preview piece', pace: 450 },
  '2048': { skills: 'planning, risk', cap: '5,000 moves', expert: 'Expectimax, depth 2 after the move', pace: 350 },
  snake: { skills: 'spatial, local planning', cap: '5,000 steps', expert: 'Shortest path with tail reachability, flood-fill fallback', pace: 110 },
  sokoban: { skills: 'long-horizon planning', cap: '4 puzzles, 60 moves each', expert: 'Exact solver (BFS over every reachable state)', pace: 260 },
  minesweeper: { skills: 'logic under uncertainty', cap: 'board end', expert: 'Mine probabilities by constraint enumeration on the frontier', pace: 350 },
  connect4: { skills: 'adversarial', cap: '6-game match', expert: 'Negamax with alpha-beta, depth 5 after the move (not a perfect solver)', pace: 800 },
  dino: { skills: 'timing, real-time', cap: '6,000 frames', expert: 'Forward simulation of wait, duck and jump plans' },
  lanes: { skills: 'timing, real-time', cap: '600 rows', expert: 'Exact lane-by-time search' },
  shifting: { skills: 'in-context rule learning', cap: '200 steps', expert: 'Planner given the true rules (oracle)', pace: 260 },
  beams: { skills: 'spatial, planning', cap: '3 puzzles, move budget', expert: 'Exact solver (BFS over mirror flips)', pace: 700 },
  courier: { skills: 'planning under uncertainty', cap: '300 ticks', expert: 'Shortest-path planner with due-time penalties', pace: 160 },
  sorter: { skills: 'text classification', cap: '300 items', expert: 'Dataset label (exact)', data: 'sms', pace: 1100 },
  switchboard: { skills: 'tool selection', cap: '300 items', expert: 'Dataset label (exact)', data: 'bfcl', pace: 1500 },
  checkpoint: { skills: 'fraud detection', cap: '300 items', expert: 'Dataset label (exact)', data: 'fraud', pace: 1100 },
} satisfies Record<GameId, Meta>;
