import { drawInt, expertAction, GAMES, type Game } from '@arcadebench/engine';
import type { Decision } from '@arcadebench/eval';
import { decide } from '@arcadebench/mcp';

export const RANDOM_RUNS = 20;

const run = <S>(g: Game<S>, seed: number, cap: number, pick: (s: S, l: string[], i: number) => string) => {
  let s = g.init(seed);
  for (let i = 0; i < cap && !g.done(s); i++) { const l = g.legal(s); s = g.step(s, l.length === 1 ? l[0] : pick(s, l, i)); }
  return g.score(s);
};

function reference(game: string, seed: number, cap: number) {
  const g = GAMES[game];
  let sum = 0;
  for (let r = 0; r < RANDOM_RUNS; r++) sum += run(g, seed, cap, (_, l, i) => l[drawInt(seed, 800 + r, i, l.length)]);
  return { expert: run(g, seed, cap, (s) => expertAction(g, s)), random: sum / RANDOM_RUNS };
}

function replay(game: string, seed: number, chosen: string[], cap: number): { error: string } | { score: number; steps: number; done: boolean; actions: string[]; decisions: Decision[] } {
  const g = GAMES[game], decisions: Decision[] = [], actions: string[] = [];
  let s = g.init(seed);
  const over = () => g.done(s) || actions.length >= cap;
  const play = (a: string) => { decisions.push(decide(g, s, actions.length, a)); s = g.step(s, a); actions.push(a); };
  const settle = () => { for (let l: string[]; !over() && (l = g.legal(s)).length === 1;) play(l[0]); };
  for (const [i, a] of chosen.entries()) {
    settle();
    if (over()) return { error: `action ${i} comes after the game ended` };
    if (!g.legal(s).includes(a)) return { error: `action ${i} "${a.slice(0, 32)}" is not legal` };
    play(a);
  }
  settle();
  return { score: g.score(s), steps: actions.length, done: over(), actions, decisions };
}

export const jobs = { reference, replay };
