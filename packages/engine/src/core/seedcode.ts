import { mix32 } from './rng.ts';

const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function crockford(n: number, len: number): string {
  let s = '';
  n = n >>> 0;
  do { s = A[n % 32] + s; n = Math.floor(n / 32); } while (n > 0);
  return s.padStart(len, '0');
}

function uncrockford(s: string): number | null {
  let n = 0;
  for (const ch of s.toUpperCase()) {
    const i = A.indexOf(ch);
    if (i < 0) return null;
    n = n * 32 + i;
    if (n > 0xffffffff) return null;
  }
  return n;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

const check = (prefix: string, major: number, seed: number) =>
  crockford(mix32((hashStr(prefix) ^ Math.imul(major, 131) ^ seed) >>> 0) & 0xfffff, 4);

export function makeSeedCode(prefix: string, major: number, seed: number): string {
  return `${prefix}-${crockford(seed, 4)}-${check(prefix, major, seed)}`;
}

export function readSeedCode(code: string, majorOf: (prefix: string) => number | undefined): { prefix: string; seed: number } | null {
  const m = /^([A-Z0-9]{3})-([0-9A-Z]{1,7})-([0-9A-Z]{4})$/.exec(code.trim().toUpperCase());
  if (!m) return null;
  const major = majorOf(m[1]);
  const seed = uncrockford(m[2]);
  if (major === undefined || seed === null) return null;
  return check(m[1], major, seed) === m[3] ? { prefix: m[1], seed } : null;
}
