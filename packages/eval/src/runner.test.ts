import { describe, expect, it } from 'vitest';
import { GAMES } from '@arcadebench/engine';
import { runEpisode } from './runner.ts';
import { expertAgent, randomAgent } from './agents/baselines.ts';
import { summarize } from './report.ts';
import type { Agent } from './types.ts';

const fake = (f: Agent['act'], name = 'fake'): Agent => ({ name, harness: 'test', settings: {}, act: f });

describe('runner', () => {
  it('turns prose into a counted invalid move and keeps playing', async () => {
    const e = await runEpisode(GAMES.connect4, 1, fake(async () => ({ action: '', latencyMs: 5, raw: 'I think column three' })), { help: 0, clock: 'none' });
    expect(e.invalid).toBeGreaterThan(0);
    expect(e.invalid).toBe(e.decisions.filter((d) => d.invalid).length);
    expect(e.steps).toBeGreaterThan(3);
  });
  it('treats a throwing agent as invalid', async () => {
    const e = await runEpisode(GAMES.beams, 2, fake(async () => { throw new Error('api down'); }), { help: 0, clock: 'none', cap: 5 });
    expect(e.invalid).toBe(5);
  });
  it('the same seed and agent always give the same episode', async () => {
    const a = await runEpisode(GAMES.tetris, 3, randomAgent(), { help: 1, clock: 'none', cap: 30 });
    const b = await runEpisode(GAMES.tetris, 3, randomAgent(), { help: 1, clock: 'none', cap: 30 });
    expect(b.actions).toEqual(a.actions); expect(b.score).toBe(a.score);
  });
  it('a slow agent on the latency clock loses frames and the run still ends', async () => {
    const e = await runEpisode(GAMES.dino, 1, fake(async (obs) => ({ action: 'jump', latencyMs: 5000 })), { help: 0, clock: 'latency' });
    expect(e.decisions[0].framesLate).toBe(300);
    expect(e.deadlineMisses).toBeGreaterThan(50);
    expect(e.capped).toBe(false);
    expect(e.score).toBeLessThan(100);
  });
  it('the token clock converts output tokens at 8 per frame', async () => {
    const e = await runEpisode(GAMES.lanes, 1, fake(async () => ({ action: 'stay', latencyMs: 0, tokensOut: 160 })), { help: 0, clock: 'token', cap: 50 });
    expect(e.decisions[0].framesLate).toBe(20);
    expect(e.deadlineMisses).toBeGreaterThan(0);
  });
  it('reports test-retest spread and split-half agreement', async () => {
    const eps = [];
    for (const seed of [0, 1, 2, 3]) {
      eps.push(await runEpisode(GAMES.snake, seed, expertAgent(), { help: 0, clock: 'none', cap: 200 }));
      for (let r = 0; r < 3; r++) eps.push(await runEpisode(GAMES.snake, seed, randomAgent(), { help: 0, clock: 'none', cap: 200, repeat: r }));
      for (let r = 0; r < 2; r++) eps.push({ ...(await runEpisode(GAMES.snake, seed, expertAgent(), { help: 0, clock: 'none', cap: 200, repeat: r })), agent: 'copycat', harness: 'test' });
    }
    const row = summarize(eps).rows.find((r) => r.agent === 'copycat')!;
    expect(row.iqm).toBeCloseTo(1, 6);
    expect(row.retestSpread).toBe(0);
    expect(row.stable).toBe(true);
  });
});
