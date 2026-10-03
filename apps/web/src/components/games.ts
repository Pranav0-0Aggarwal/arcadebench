export interface Meta { skills: string; cap: string; expert: string }

export const META: Record<string, Meta> = {
  tetris: { skills: 'spatial, planning', cap: '500 pieces', expert: 'El-Tetris weights, 2-ply over the preview piece' },
  '2048': { skills: 'planning, risk', cap: '1,000 moves', expert: 'Expectimax, depth 3 to 4' },
  snake: { skills: 'spatial, local planning', cap: '5,000 steps', expert: 'Shortest path with tail reachability, Hamiltonian fallback' },
  sokoban: { skills: 'long-horizon planning', cap: '200 moves', expert: 'Exact solver (BFS and A*)' },
  minesweeper: { skills: 'logic under uncertainty', cap: 'board end', expert: 'Exact mine-probability solver' },
  connect4: { skills: 'adversarial', cap: 'game end', expert: 'Pons perfect solver' },
  dino: { skills: 'timing, real-time', cap: '3,000 points', expert: 'Forward simulation over visible obstacles' },
  lanes: { skills: 'timing, real-time', cap: 'fixed course', expert: 'Exact lane-by-time search' },
  shifting: { skills: 'in-context rule learning', cap: '200 steps', expert: 'Rule-aware planner given the true rules (oracle)' },
  beams: { skills: 'spatial, planning', cap: 'move budget', expert: 'Exact solver (BFS over rotations)' },
  courier: { skills: 'planning under uncertainty', cap: '300 ticks', expert: 'Lookahead planner with expected-value rollouts' },
};
