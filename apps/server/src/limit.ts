import { Fail } from './util.ts';

const KEYS = 20_000;

export function limiter(max: number, windowMs: number, now: () => number, message: string) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string) => {
    const t = now();
    let h = hits.get(key);
    if (!h || h.reset <= t) {
      hits.delete(key);
      for (const [k, v] of hits) { if (v.reset > t && hits.size < KEYS) break; hits.delete(k); }
      hits.set(key, h = { n: 0, reset: t + windowMs });
    }
    if (++h.n > max) throw new Fail(429, message, Math.ceil((h.reset - t) / 1000));
  };
}
