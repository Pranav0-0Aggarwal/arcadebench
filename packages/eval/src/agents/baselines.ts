import { drawInt, expertAction } from '@arcadebench/engine';
import type { Agent } from '../types.ts';

const instant = (action: string) => ({ action, latencyMs: 0 });
export const randomAgent = (): Agent => ({ name: 'random', harness: 'baseline', settings: {}, act: async (obs, c) => instant(obs.actions[drawInt(c.seed, 800 + c.repeat, c.step, obs.actions.length)].id) });
export const expertAgent = (): Agent => ({ name: 'expert', harness: 'baseline', settings: {}, act: async (_obs, c) => instant(expertAction(c.game, c.state)) });
export const nullAgent = (): Agent => ({ name: 'null', harness: 'baseline', settings: {}, act: async (obs) => instant(obs.actions[0].id) });
