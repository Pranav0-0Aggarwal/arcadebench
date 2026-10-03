import type { Agent } from '../types.ts';
import { expertAgent, nullAgent, randomAgent } from './baselines.ts';
import { deepseekAgent, ollamaAgent } from './llm.ts';
import { systemOneAgent } from './systemOne.ts';

export function makeAgent(spec: string): Agent {
  if (spec === 'expert') return expertAgent();
  if (spec === 'random') return randomAgent();
  if (spec === 'null') return nullAgent();
  if (spec === 'deepseek') return deepseekAgent({ thinking: false });
  if (spec === 'deepseek+thinking') return deepseekAgent({ thinking: true });
  if (spec.startsWith('ollama:')) return ollamaAgent(spec.slice(7));
  if (spec.startsWith('s1:')) return systemOneAgent(spec.slice(3));
  throw new Error(`unknown agent "${spec}"`);
}
export const isBaseline = (spec: string) => ['expert', 'random', 'null'].includes(spec);
