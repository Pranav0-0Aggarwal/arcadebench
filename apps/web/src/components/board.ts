import type { AgentType, BoardRow } from '@arcadebench/api';

export const TONE = { expert: '#7c8796', llm: '#4654e6', human: '#0f8f80', s1: '#d9502f', rand: '#a443bd', agent: '#151a22', other: '#525c6c' };
const BY_KIND: Record<AgentType, string> = { llm: TONE.llm, 'system-one': TONE.s1, agent: TONE.agent, other: TONE.other };
export const KIND: Record<AgentType, string> = { llm: 'LLM', 'system-one': 'System One', agent: 'Agent', other: 'Other' };
export const TRACKS = [['turn', 'Turn-based'], ['latency', 'Latency clock'], ['token', 'Token clock'], ['computer-use', 'Computer use'], ['human', 'Human']] as const;

export const tone = (r: BoardRow) => r.badge === 'official' ? (/random/i.test(r.name) ? TONE.rand : TONE.expert) : r.track === 'human' ? TONE.human : BY_KIND[r.agentType ?? 'other'];

export function axis(rows: BoardRow[]) {
  const lo = Math.min(0, ...rows.map((r) => r.lo)), hi = Math.max(1.15, ...rows.map((r) => r.hi));
  return (v: number) => (v - lo) / (hi - lo);
}
