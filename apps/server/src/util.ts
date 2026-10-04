import { createHash, randomBytes } from 'node:crypto';

export type Status = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 422 | 429 | 503;
export class Fail extends Error { constructor(public status: Status, message: string, public retry?: number) { super(message); } }

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const rid = (bytes = 9) => randomBytes(bytes).toString('base64url');
export const log = (ev: string, o: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), ev, ...o }));
export const logError = (e: unknown, o: Record<string, unknown> = {}) => log('error', { ...o, msg: e instanceof Error ? e.message : String(e) });

export const median = (v: number[]): number | null => (v.length ? [...v].sort((a, b) => a - b)[v.length >> 1] : null);
export const quiet = (e: unknown) => { if (!(e instanceof Fail)) logError(e); };
export const major = (v: string) => v.split('.')[0];
