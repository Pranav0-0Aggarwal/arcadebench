import { play, randomPolicy, expertPolicy, nullPolicy } from '../packages/engine/src/core/contract.ts';
const [file, name, seedsArg, capArg] = process.argv.slice(2);
const mod = await import(`../packages/engine/src/games/${file}.ts`);
const g = mod[name], seeds = +(seedsArg ?? 10), cap = capArg ? +capArg : g.maxSteps;
const mean = (f: (s: number) => number) => { let t = 0; for (let s = 0; s < seeds; s++) t += f(s); return +(t / seeds).toFixed(2); };
const t0 = performance.now();
const e = mean((s) => play(g, s, expertPolicy(g), cap).score);
const t1 = performance.now();
console.log(JSON.stringify({ game: g.id, seeds, cap, expert: e, random: mean((s) => play(g, s, randomPolicy(g), cap).score), null: mean((s) => play(g, s, nullPolicy(g), cap).score), expertMsPerGame: Math.round((t1 - t0) / seeds) }));
