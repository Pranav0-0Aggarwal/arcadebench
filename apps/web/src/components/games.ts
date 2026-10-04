export interface Meta { skills: string; cap: string; expert: string }

export const META: Record<string, Meta> = {
  tetris: { skills: 'spatial, planning', cap: '100 pieces', expert: 'El-Tetris weights, 2-ply over the preview piece' },
  '2048': { skills: 'planning, risk', cap: '300 moves', expert: 'Expectimax, depth 2 after the move' },
  snake: { skills: 'spatial, local planning', cap: '600 steps', expert: 'Shortest path with tail reachability, flood-fill fallback' },
  sokoban: { skills: 'long-horizon planning', cap: '4 puzzles, 60 moves each', expert: 'Exact solver (BFS over every reachable state)' },
  minesweeper: { skills: 'logic under uncertainty', cap: 'board end', expert: 'Mine probabilities by constraint enumeration on the frontier' },
  connect4: { skills: 'adversarial', cap: '6-game match', expert: 'Negamax with alpha-beta, depth 5 after the move (not a perfect solver)' },
  dino: { skills: 'timing, real-time', cap: '6,000 frames', expert: 'Forward simulation of wait, duck and jump plans' },
  lanes: { skills: 'timing, real-time', cap: '400 rows', expert: 'Exact lane-by-time search' },
  shifting: { skills: 'in-context rule learning', cap: '200 steps', expert: 'Planner given the true rules (oracle)' },
  beams: { skills: 'spatial, planning', cap: '3 puzzles, move budget', expert: 'Exact solver (BFS over mirror flips)' },
  courier: { skills: 'planning under uncertainty', cap: '300 ticks', expert: 'Shortest-path planner with due-time penalties' },
};
