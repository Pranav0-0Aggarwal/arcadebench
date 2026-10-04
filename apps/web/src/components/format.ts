import type { LiveSession } from '@arcadebench/api';

export const f2 = (v: number) => v.toFixed(2);
export const who = (e: LiveSession['entry']) => (e ? (e.x ? `${e.name} @${e.x}` : e.name) : 'Anonymous practice');
export const ms = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`);
export const pctl = (v: number[], p: number) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export const unit = (game: string) => (game === 'chess' ? ' win-probability points' : '');
