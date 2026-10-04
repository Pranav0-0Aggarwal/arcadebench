import { createHash, randomBytes } from 'node:crypto';

export type Status = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 422 | 429;
export class Fail extends Error { constructor(public status: Status, message: string) { super(message); } }

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const rid = (bytes = 9) => randomBytes(bytes).toString('base64url');
export const logError = (e: unknown) => console.error(e instanceof Error ? e.message : String(e));

export const median = (v: number[]): number | null => (v.length ? [...v].sort((a, b) => a - b)[v.length >> 1] : null);
