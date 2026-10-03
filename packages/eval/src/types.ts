import type { Game, HelpLevel, Observation } from '@arcadebench/engine';
import type { Turn } from '@arcadebench/harness';

export type Clock = 'none' | 'latency' | 'token';
export interface Decision {
  step: number; action: string; expert: string; agree: boolean; regret: number; forced: boolean; invalid: boolean;
  latencyMs?: number; tokensIn?: number; tokensOut?: number; framesLate?: number;
}
export interface Episode {
  agent: string; harness: string; game: string; version: string; seed: number; help: HelpLevel; clock: Clock; repeat: number;
  score: number; steps: number; cap: number; capped: boolean; truncated: boolean; invalid: number; deadlineMisses: number;
  regretExact: boolean; promptHash: string; settings: Record<string, unknown>;
  decisions: Decision[]; actions: string[]; startedAt: string; wallMs: number;
}
/** `state` is the true game state: only official baselines (expert) may read it; model agents get the observation only */
export interface AgentCtx { game: Game<any>; seed: number; help: HelpLevel; step: number; repeat: number; history: Turn[]; state: unknown }
export interface Reply { action: string; latencyMs: number; tokensIn?: number; tokensOut?: number; raw?: string; error?: string }
export interface Agent {
  name: string; harness: string; settings: Record<string, unknown>;
  act(obs: Observation, ctx: AgentCtx): Promise<Reply>;
  close?(): Promise<void>;
}
