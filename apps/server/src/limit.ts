export function limiter(max: number, windowMs: number, now: () => number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string) => {
    const t = now();
    let h = hits.get(key);
    if (!h || h.reset <= t) {
      if (hits.size > 10000) for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
      h = { n: 0, reset: t + windowMs };
      hits.set(key, h);
    }
    return ++h.n <= max;
  };
}
