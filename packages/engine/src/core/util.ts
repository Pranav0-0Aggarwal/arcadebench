export const range = (n: number) => [...Array(n).keys()];

export const grid = <T>(h: number, w: number, f: (i: number) => T): T[][] =>
  Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => f(y * w + x)));

export const lines = (g: string[][], sep = '') => g.map((r) => r.join(sep)).join('\n');

export const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export const memo = <K, V>(f: (k: K) => V) => {
  const c = new Map<K, V>();
  return (k: K): V => {
    let v = c.get(k);
    if (v === undefined) c.set(k, v = f(k));
    return v;
  };
};

export const neighbors = (w: number, h: number, ds: number[][]) =>
  Array.from({ length: w * h }, (_, p) =>
    ds.map(([dx, dy]) => [(p % w) + dx, Math.floor(p / w) + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h).map(([x, y]) => y * w + x));
