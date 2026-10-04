import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { draw, drawInt, mix32, shuffle } from './rng.ts';
import { makeSeedCode, readSeedCode } from './seedcode.ts';
import { memo } from './util.ts';

describe('rng', () => {
  it('is pure and stable across processes', () => {
    const here = [draw(1, 0, 0), draw(1, 1, 0), draw(4294967295, 7, 99), mix32(123456789)];
    const out = execFileSync(process.execPath, ['--input-type=module', '-e',
      `function mix32(x){x=Math.imul((x^(x>>>16))>>>0,0x7feb352d);x=Math.imul((x^(x>>>15))>>>0,0x846ca68b);return (x^(x>>>16))>>>0}
       const draw=(s,st,i)=>mix32(mix32(mix32(s>>>0)^Math.imul(st+1,0x9e3779b9))^(i>>>0));
       console.log(JSON.stringify([draw(1,0,0),draw(1,1,0),draw(4294967295,7,99),mix32(123456789)]))`]).toString();
    expect(JSON.parse(out)).toEqual(here);
    expect(here).toMatchSnapshot();
  });
  it('drawInt is uniform within 3%', () => {
    const n = 7, N = 100000, c = Array(n).fill(0);
    for (let i = 0; i < N; i++) c[drawInt(42, 3, i, n)]++;
    for (const k of c) expect(Math.abs(k / N - 1 / n)).toBeLessThan(0.03 / n * 3);
  });
  it('shuffle is a permutation', () => {
    expect(shuffle([1, 2, 3, 4, 5, 6, 7], 9, 1).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('seed codes', () => {
  const majors: Record<string, number> = { TET: 1, SNK: 1 };
  it('round-trips', () => {
    for (const seed of [0, 1, 1047, 99999, 4294967295]) {
      const code = makeSeedCode('TET', 1, seed);
      expect(readSeedCode(code, (p) => majors[p])).toEqual({ prefix: 'TET', seed });
    }
  });
  it('rejects a changed character, an unknown game, or another engine major', () => {
    const code = makeSeedCode('TET', 1, 1047);
    const bad = code.slice(0, -1) + (code.endsWith('0') ? '1' : '0');
    expect(readSeedCode(bad, (p) => majors[p])).toBeNull();
    expect(readSeedCode(code.replace('TET', 'XYZ'), (p) => majors[p])).toBeNull();
    expect(readSeedCode(code, () => 2)).toBeNull();
  });
});

describe('memo', () => {
  it('keeps at most max entries, evicting the least recently used', () => {
    let n = 0;
    const f = memo((k: number) => (n++, k * 2), 2);
    f(1); f(2); f(1); f(3);
    expect([f(1), n]).toEqual([2, 3]);
    expect([f(2), n]).toEqual([4, 4]);
  });
});
