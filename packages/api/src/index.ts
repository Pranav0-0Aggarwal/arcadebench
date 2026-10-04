import type { ActionInfo, HelpLevel } from '@arcadebench/engine';

export const BASE_PATH = '/arcadebench';
export const API = `${BASE_PATH}/api/v1`;
export const SITE_ORIGIN = 'https://penguinzz.com';

export type Mode = 'tool' | 'computer-use';
export type Kind = 'ai' | 'human';
export type Listing = 'listed' | 'unlisted';
export type Track = 'turn' | 'latency' | 'token' | 'computer-use' | 'human' | 'match';
export type AgentType = 'llm' | 'system-one' | 'agent' | 'other';

export interface RegisterReq {
  kind: Kind; x: string; email: string; linkedin?: string; listing: Listing;
  model?: string; mode?: Mode; agentType?: AgentType; help?: HelpLevel;
  skill?: 'first-time' | 'sometimes' | 'often'; baselineOptIn?: boolean;
}
export interface RegisterRes { entryId: string; link: string; mcpUrl: string; apiBase: string; playUrl: string }

export interface GameInfo { id: string; prefix: string; name: string; version: string; rules: string; ask?: string; realtime: null | { framesPerStep: number; defaultAction: string }; cap: number; original: boolean; history?: number }

export interface DailySeeds { date: string; seeds: Record<string, string> }

export type RunMode = 'practice' | 'benchmark';
export interface StartReq { game: string; mode: RunMode | 'ranked'; seed?: number; seedCode?: string; help?: HelpLevel; clock?: 'none' | 'latency' | 'token' }
export interface Observation { session: string; watch: string; watchUrl: string; game: string; seedCode: string | null; step: number; score: number; done: boolean; state: string; data: unknown; legalActions: ActionInfo[]; rules?: string }
export interface MoveReq { action: string; tokensOut?: number; step?: number }
export interface MoveRes extends Observation { invalid?: string }

export interface VerifyReq { game: string; seedCode: string; actions: string[]; as?: 'human' | 'agent' }
export interface VerifyRes { runId: string; score: number; normalized: number | null; compare: { name: string; score: number }[] }

export interface RunDecision { step: number; action: string; expert: string; agree: boolean; regret: number; forced: boolean; invalid: boolean; latencyMs?: number }
export interface RunRes { match?: MatchRecord; id: string; entry: { name: string; x?: string; badge: 'official' | 'registered' }; game: string; version: string; seedCode: string; track: Track; help: HelpLevel;
  score: number; normalized: number | null; steps: number; actions: string[]; decisions: RunDecision[]; createdAt: string }

export type RunSummary = Omit<RunRes, 'version' | 'actions' | 'decisions'>;

export interface BoardRow { entryId: string; name: string; x?: string; badge: 'official' | 'registered'; agentType?: AgentType; track: Track; help?: HelpLevel;
  iqm: number; lo: number; hi: number; rank: [number, number]; group: number; seeds: number; agreement: number | null; retestSpread: number | null; averaged: boolean; latencyMs: number | null }
export interface BoardRes { game: string | 'overall'; track: Track; help: HelpLevel | 'all'; rows: BoardRow[]; updatedAt: string }

export interface Scorecard { entryId: string; name: string; listing: Listing; mode?: Mode; rows: BoardRow[]; runs: { id: string; game: string; seedCode: string; score: number; normalized: number | null; createdAt: string }[] }

export interface ApiError { error: string; detail?: string }

export const LIMITS = { bodyBytes: 64 * 1024, verifyActions: 20000, registerPerIpPerHour: 20, requestsPerTokenPerMinute: 600, maxOpenSessionsPerToken: 8, xHandle: /^[A-Za-z0-9_]{1,15}$/ } as const;

export interface LastMove { step: number; action: string; expert: string; regret: number; agree: boolean; invalid: boolean; latencyMs?: number }
export interface LiveFrame { match?: MatchLive; watch: string; game: string; seedCode: string; mode: RunMode | 'match'; entry: { name: string; x?: string } | null; step: number; score: number; done: boolean; data: unknown; last: LastMove | null; regrets: number[]; medianMs: number | null; runId?: string; actions?: string[] }
export interface LiveSession { match?: { white: string; black: string }; watch: string; game: string; seedCode: string; mode: RunMode | 'match'; entry: { name: string; x?: string } | null; step: number; score: number; startedAt: string }

export type Color = 'white' | 'black';
export type SeatKind = 'human' | 'agent' | 'computer';
export const CHESS = { moveMs: 10 * 60_000, queueMs: 10 * 60_000, openMs: 60 * 60_000, perHour: 60, openPerOwner: 8, provisional: 10, start: 1200, k: 32, kProvisional: 48 } as const;

export interface MatchReq { white: string; black: string; me?: Color; name?: string }
export interface SeatInfo { kind: SeatKind; name: string | null; x?: string; level?: number; joined: boolean; elo: number | null }
export interface MoveGrade { best: string; cp: number; bestCp: number; loss: number; accuracy: number; tier: number }
export interface MatchView {
  id: string; watch: string; watchUrl: string; status: 'open' | 'live' | 'done'; white: SeatInfo; black: SeatInfo; turn: Color; fen: string; moves: string[]; sans: string[];
  result: '1-0' | '0-1' | '1/2-1/2' | null; why: string; draw: Color | null; deadline: string | null; accuracy: [number | null, number | null]; grades: (MoveGrade | null)[]; runId?: string;
  you?: Color; legal?: { id: string; san: string }[]; board?: string;
}
export interface SeatOut { color: Color; kind: SeatKind; level?: number; token?: string; invite?: string }
export interface MatchRes { match: MatchView; seats: SeatOut[]; token?: string }
export interface ChessMoveReq { move: string; seat?: string }
export interface QueueReq { color?: Color | 'any'; computer?: { level: number; after: number }; name?: string }
export interface QueueRes { ticket: string; status: 'waiting' | 'matched'; expires: string; fallback?: string; match?: MatchRes; color?: Color }
export interface MatchLive { white: SeatInfo; black: SeatInfo; status: MatchView['status']; result: MatchView['result']; why: string; draw: Color | null; sans: string[]; accuracy: [number | null, number | null]; grades: (MoveGrade | null)[]; deadline: string | null }
export interface MatchRecord extends MatchLive { elo: ({ before: number; after: number } | null)[]; tiers: number[][] }
export interface ChessRow { entryId: string; name: string; x?: string; badge: 'official' | 'registered'; kind: Kind | 'computer'; elo: number; provisional: boolean; games: number; wins: number; draws: number; losses: number; accuracy: number | null; blunders: number }
export interface ChessBoard { rows: ChessRow[]; updatedAt: string }
