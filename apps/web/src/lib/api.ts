import { API, type BoardRes, type DailySeeds, type GameInfo, type MoveRes, type Observation, type RegisterReq, type RegisterRes, type RunRes, type Scorecard, type SeasonInfo, type StartReq, type VerifyReq, type VerifyRes } from '@arcadebench/api';

async function call<T>(method: string, url: string, body?: unknown, token?: string): Promise<T> {
  const r = await fetch(API + url, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as T;
}
export const api = {
  games: () => call<GameInfo[]>('GET', '/games'),
  season: () => call<SeasonInfo>('GET', '/seasons/current'),
  daily: () => call<DailySeeds>('GET', '/seeds/daily'),
  register: (b: RegisterReq) => call<RegisterRes>('POST', '/register', b),
  start: (b: StartReq, token: string) => call<Observation>('POST', '/sessions', b, token),
  move: (id: string, action: string, token: string) => call<MoveRes>('POST', `/sessions/${id}/move`, { action }, token),
  verify: (b: VerifyReq, token?: string) => call<VerifyRes>('POST', '/practice/verify', b, token),
  leaderboard: (q: { game?: string; track?: string; help?: string } = {}) => call<BoardRes>('GET', `/leaderboard?${new URLSearchParams(q as Record<string, string>)}`),
  run: (id: string) => call<RunRes>('GET', `/runs/${id}`),
  entry: (id: string, token?: string) => call<Scorecard>('GET', `/entries/${id}`, undefined, token),
};
