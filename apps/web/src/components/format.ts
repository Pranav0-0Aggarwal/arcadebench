import type { LiveSession } from '@arcadebench/api';

export const f2 = (v: number) => v.toFixed(2);
export const who = (e: LiveSession['entry']) => (e ? (e.x ? `${e.name} @${e.x}` : e.name) : 'Anonymous practice');
