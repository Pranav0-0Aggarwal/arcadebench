/** Integer hash (lowbias32). Pure 32-bit integer math, identical on every JS engine. */
export function mix32(x: number): number {
  x = Math.imul((x ^ (x >>> 16)) >>> 0, 0x7feb352d);
  x = Math.imul((x ^ (x >>> 15)) >>> 0, 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** The i-th draw of a named stream for a seed. Counter based: random access, and never affected by agent actions. */
export function draw(seed: number, stream: number, i: number): number {
  return mix32(mix32(mix32(seed >>> 0) ^ Math.imul(stream + 1, 0x9e3779b9)) ^ (i >>> 0));
}

export function drawInt(seed: number, stream: number, i: number, n: number): number {
  return Math.floor((draw(seed, stream, i) / 4294967296) * n);
}

/** Fisher-Yates shuffle driven by one stream; draws start at `offset`. */
export function shuffle<T>(xs: T[], seed: number, stream: number, offset = 0): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = drawInt(seed, stream, offset + i, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
