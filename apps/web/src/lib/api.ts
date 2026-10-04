import { API, type BoardRes, type ChessBoard, type ChessMoveReq, type MatchReq, type MatchRes, type MatchView, type QueueReq, type QueueRes, type DailySeeds, type GameInfo, type MoveRes, type Observation, type RegisterReq, type RegisterRes, type LiveFrame, type LiveSession, type RunRes, type Scorecard, type StartReq, type VerifyReq, type VerifyRes } from '@arcadebench/api';

export class HttpError extends Error { constructor(m: string, readonly status: number) { super(m); } }

async function call<T>(method: string, url: string, body?: unknown, token?: string, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetch(API + url, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new HttpError(j.error ?? `HTTP ${r.status}`, r.status);
  return j as T;
}
export const api = {
  games: () => call<GameInfo[]>('GET', '/games'),
  daily: () => call<DailySeeds>('GET', '/seeds/daily'),
  register: (b: RegisterReq) => call<RegisterRes>('POST', '/register', b),
  start: (b: StartReq, token: string) => call<Observation>('POST', '/sessions', b, token),
  move: (id: string, action: string, token: string) => call<MoveRes>('POST', `/sessions/${id}/move`, { action }, token),
  verify: (b: VerifyReq, token?: string) => call<VerifyRes>('POST', '/practice/verify', b, token),
  leaderboard: (q: { game?: string; track?: string; help?: string } = {}) => call<BoardRes>('GET', `/leaderboard?${new URLSearchParams(q as Record<string, string>)}`),
  run: (id: string) => call<RunRes>('GET', `/runs/${id}`),
  live: () => call<LiveSession[]>('GET', '/live'),
  watch: (id: string) => call<LiveFrame>('GET', `/watch/${encodeURIComponent(id)}`),
  entry: (id: string, token?: string) => call<Scorecard>('GET', `/entries/${id}`, undefined, token),
  chess: {
    create: (b: MatchReq, token?: string) => call<MatchRes>('POST', '/matches', b, token),
    match: (id: string, seat?: string, token?: string, wait?: number) => call<MatchView>('GET', `/matches/${encodeURIComponent(id)}${wait ? `?wait=${wait}` : ''}`, undefined, token, seat ? { 'x-seat': seat } : {}),
    join: (id: string, seat: string, name?: string, token?: string) => call<MatchRes>('POST', `/matches/${encodeURIComponent(id)}/join`, { seat, ...(name && { name }) }, token),
    move: (id: string, seat: string, move: string) => call<MatchRes>('POST', `/matches/${encodeURIComponent(id)}/move`, { move } satisfies ChessMoveReq, undefined, { 'x-seat': seat }),
    resign: (id: string, seat: string) => call<MatchRes>('POST', `/matches/${encodeURIComponent(id)}/resign`, {}, undefined, { 'x-seat': seat }),
    draw: (id: string, seat: string, action: 'offer' | 'accept' | 'decline') => call<MatchRes>('POST', `/matches/${encodeURIComponent(id)}/draw`, { action }, undefined, { 'x-seat': seat }),
    queue: (b: QueueReq, token?: string) => call<QueueRes>('POST', '/queue', b, token),
    waiting: (ticket: string, token?: string) => call<QueueRes>('GET', '/queue', undefined, token, { 'x-ticket': ticket }),
    leave: (ticket: string) => call<{ ok: true }>('DELETE', '/queue', undefined, undefined, { 'x-ticket': ticket }),
    ratings: (token?: string) => call<ChessBoard>('GET', '/chess/ratings', undefined, token),
  },
};
