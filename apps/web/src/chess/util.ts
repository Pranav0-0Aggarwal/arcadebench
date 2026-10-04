import { useEffect, useState } from 'react';
import type { Color, MatchReq, SeatOut } from '@arcadebench/api';

export interface Saved { seat?: string; invites?: SeatOut[] }
export interface Slot { kind: 'me' | 'human' | 'agent' | 'computer'; level: number }

const ENTRY = 'ab-token', TICKET = 'ab-chess-ticket', SEAT = /^#[A-Za-z0-9_-]{16,64}$/;

const read = (s: Storage, k: string) => { try { return s.getItem(k); } catch { return null; } };
const write = (s: Storage, k: string, v: string | null) => { try { if (v === null) s.removeItem(k); else s.setItem(k, v); } catch {} };

export const entry = () => read(localStorage, ENTRY) ?? undefined;
export const ticket = { get: () => read(sessionStorage, TICKET), set: (v: string | null) => write(sessionStorage, TICKET, v) };
export const saved = (id: string): Saved => { try { return JSON.parse(read(sessionStorage, `ab-chess:${id}`) ?? '{}'); } catch { return {}; } };
export const keep = (id: string, s: Saved) => write(sessionStorage, `ab-chess:${id}`, JSON.stringify(s));
export const fragment = (hash: string) => (SEAT.test(hash) ? hash.slice(1) : '');
export const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const spec = (s: Slot) => (s.kind === 'computer' ? `computer:${s.level}` : s.kind === 'me' ? 'human' : s.kind);
export const request = (white: Slot, black: Slot, name?: string): MatchReq => ({ white: spec(white), black: spec(black), ...(white.kind === 'me' ? { me: 'white' as Color } : black.kind === 'me' ? { me: 'black' as Color } : {}), ...(name && { name }) });
export const pairs = (n: number) => Array.from({ length: Math.ceil(n / 2) }, (_, i) => [2 * i, 2 * i + 1].filter((p) => p < n));

export function useNow(on = true) {
  const [t, set] = useState(Date.now());
  useEffect(() => { if (!on) return; set(Date.now()); const h = setInterval(() => set(Date.now()), 1000); return () => clearInterval(h); }, [on]);
  return t;
}
