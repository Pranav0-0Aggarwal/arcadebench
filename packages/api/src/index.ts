/**
 * ArcadeBench HTTP API v1: the one contract shared by apps/server, apps/web and sdk/python.
 * Everything is served under BASE_PATH; the API under `${BASE_PATH}/api/v1`.
 * Auth: `Authorization: Bearer <link token>` (the private link from /register). Tokens are stored only as SHA-256 hashes.
 */
import type { ActionInfo, HelpLevel } from '@arcadebench/engine';

export const BASE_PATH = '/arcadebench';
export const API = `${BASE_PATH}/api/v1`;
export const SITE_ORIGIN = 'https://penguinzz.com';

export type Mode = 'tool' | 'computer-use';
export type Kind = 'ai' | 'human';
export type Listing = 'listed' | 'unlisted';
export type Track = 'turn' | 'latency' | 'token' | 'computer-use' | 'human';
export type AgentType = 'llm' | 'system-one' | 'agent' | 'other';

// POST /register
export interface RegisterReq {
  kind: Kind; x: string; email: string; linkedin?: string; listing: Listing;
  /** ai only */ model?: string; mode?: Mode; agentType?: AgentType; help?: HelpLevel;
  /** human only */ skill?: 'first-time' | 'sometimes' | 'often'; baselineOptIn?: boolean;
}
export interface RegisterRes { entryId: string; link: string; mcpUrl: string; apiBase: string; playUrl: string }

// GET /games
export interface GameInfo { id: string; prefix: string; name: string; version: string; rules: string; realtime: null | { framesPerStep: number; defaultAction: string }; cap: number; original: boolean }

// GET /seasons/current
export interface SeasonInfo { id: string; opens: string; closes: string; seedsPerGame: number; commitment: string; revealed?: Record<string, number[]> }
// GET /seeds/daily
export interface DailySeeds { date: string; seeds: Record<string, string> }

// POST /sessions  (practice: a seed or seedCode; ranked: the server picks the next hidden season seed)
export interface StartReq { game: string; mode: 'practice' | 'ranked'; seed?: number; seedCode?: string; help?: HelpLevel; clock?: 'none' | 'latency' | 'token' }
export interface Observation { session: string; game: string; seedCode: string | null; step: number; score: number; done: boolean; state: string; data: unknown; legalActions: ActionInfo[]; rules?: string }
// POST /sessions/:id/move
export interface MoveReq { action: string; tokensOut?: number }
export interface MoveRes extends Observation { invalid?: string }

// POST /practice/verify: browser play (humans, computer-use agents); the server re-simulates the action log
export interface VerifyReq { game: string; seedCode: string; actions: string[]; as?: 'human' | 'agent' }
export interface VerifyRes { runId: string; score: number; normalized: number | null; compare: { name: string; score: number }[] }

// GET /runs/:id
export interface RunDecision { step: number; action: string; expert: string; agree: boolean; regret: number; forced: boolean; invalid: boolean; latencyMs?: number }
export interface RunRes { id: string; entry: { name: string; x?: string; badge: 'official' | 'registered' }; game: string; version: string; seedCode: string; track: Track; help: HelpLevel;
  score: number; normalized: number | null; steps: number; actions: string[]; decisions: RunDecision[]; createdAt: string }

// GET /leaderboard?game=&track=&help=
export interface BoardRow { entryId: string; name: string; x?: string; badge: 'official' | 'registered'; agentType?: AgentType; track: Track; help?: HelpLevel;
  iqm: number; lo: number; hi: number; rank: [number, number]; group: number; seeds: number; agreement: number | null; retestSpread: number | null; averaged: boolean }
export interface BoardRes { season: string; game: string | 'overall'; track: Track; help: HelpLevel | 'all'; rows: BoardRow[]; updatedAt: string }

// GET /entries/:id (scorecard; unlisted entries need the owner's token)
export interface Scorecard { entryId: string; name: string; listing: Listing; mode?: Mode; rows: BoardRow[]; runs: { id: string; game: string; seedCode: string; score: number; normalized: number | null; createdAt: string }[] }

export interface ApiError { error: string; detail?: string }

/** limits enforced by the server */
export const LIMITS = { bodyBytes: 64 * 1024, verifyActions: 20000, registerPerIpPerHour: 20, requestsPerTokenPerMinute: 600, maxOpenSessionsPerToken: 8, xHandle: /^[A-Za-z0-9_]{1,15}$/ } as const;
