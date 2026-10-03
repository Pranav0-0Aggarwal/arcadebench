import { createHash, randomBytes } from 'node:crypto';

export type Status = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 422 | 429;
export class Fail extends Error { constructor(public status: Status, message: string) { super(message); } }

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const rid = (bytes = 9) => randomBytes(bytes).toString('base64url');
export const canon = (v: unknown) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
export const logError = (e: unknown) => console.error(e instanceof Error ? e.message : String(e));
