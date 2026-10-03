import { drawInt, observe, type Game, type HelpLevel } from '@arcadebench/engine';
import { PROMPT_HASH, type Turn } from '@arcadebench/harness';
import type { Agent, Clock, Decision, Episode } from './types.ts';

export const TOKENS_PER_FRAME = 8;
const FRAME_MS = 1000 / 60;

export interface RunOpts { help: HelpLevel; clock: Clock; cap?: number; repeat?: number }

export async function runEpisode<S>(g: Game<S>, seed: number, agent: Agent, o: RunOpts): Promise<Episode> {
  const t0 = performance.now(), cap = o.cap ?? g.maxSteps, repeat = o.repeat ?? 0;
  let s = g.init(seed), steps = 0, invalid = 0, misses = 0;
  const decisions: Decision[] = [], actions: string[] = [], history: Turn[] = [];
  const apply = (a: string) => { const before = g.score(s); s = g.step(s, a); actions.push(a); steps++; return g.score(s) - before; };
  while (!g.done(s) && steps < cap) {
    const legal = g.legal(s), values = g.values(s);
    let expert = legal[0];
    for (const a of legal) if (values[a] > values[expert]) expert = a;
    const best = values[expert];
    if (legal.length === 1) {
      decisions.push({ step: steps, action: legal[0], expert, agree: true, regret: 0, forced: true, invalid: false });
      history.push({ action: legal[0], scoreDelta: apply(legal[0]) });
      continue;
    }
    const obs = observe(g, s, o.help);
    let reply;
    try { reply = await agent.act(obs, { game: g, seed, help: o.help, step: steps, repeat, history, state: s }); }
    catch (e) { reply = { action: '', latencyMs: 0, error: String(e) }; }
    const bad = !legal.includes(reply.action);
    const action = bad ? legal[drawInt(seed, 990 + repeat, steps, legal.length)] : reply.action;
    if (bad) invalid++;
    const d: Decision = { step: steps, action, expert, agree: values[action] >= best - 1e-9, regret: best - values[action], forced: false, invalid: bad,
      latencyMs: Math.round(reply.latencyMs), tokensIn: reply.tokensIn, tokensOut: reply.tokensOut };
    if (g.realtime && o.clock !== 'none') {
      const frames = o.clock === 'latency' ? Math.ceil(reply.latencyMs / FRAME_MS) : Math.ceil((reply.tokensOut ?? 0) / TOKENS_PER_FRAME);
      const late = Math.floor(frames / g.realtime.framesPerStep);
      d.framesLate = frames;
      for (let k = 0; k < late && !g.done(s) && steps < cap; k++) { apply(g.realtime.defaultAction); misses++; }
    }
    decisions.push(d);
    if (g.done(s) || steps >= cap) break;
    history.push({ action, scoreDelta: apply(action) });
  }
  return {
    agent: agent.name, harness: agent.harness, game: g.id, version: g.version, seed, help: o.help, clock: o.clock, repeat,
    score: g.score(s), steps, cap, capped: !g.done(s) && steps >= cap, truncated: false, invalid, deadlineMisses: misses,
    regretExact: g.valuesExact, promptHash: PROMPT_HASH, settings: agent.settings,
    decisions, actions, startedAt: new Date(Date.now() - (performance.now() - t0)).toISOString(), wallMs: Math.round(performance.now() - t0),
  };
}
