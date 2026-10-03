import { API, type BoardRes, type DailySeeds, type GameInfo, type MoveRes, type Observation, type RegisterReq, type RegisterRes, type LiveFrame, type LiveSession, type RunRes, type Scorecard, type StartReq, type VerifyReq, type VerifyRes } from '@arcadebench/api';

export class HttpError extends Error { constructor(m: string, readonly status: number) { super(m); } }

async function call<T>(method: string, url: string, body?: unknown, token?: string): Promise<T> {
  const r = await fetch(API + url, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
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
};
