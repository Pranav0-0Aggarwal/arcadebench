import { describe, expect, it } from 'vitest';
import { GAMES } from '@arcadebench/engine';
import { DATASETS } from './components/datasets.ts';
import { GROUPS, META } from './components/games.ts';
import { CONTROLS, type Host } from './game/controls.ts';

const ids = Object.keys(GAMES).sort();

describe('web registries', () => {
  it('cover exactly the engine games', () => {
    expect(Object.keys(META).sort()).toEqual(ids);
    expect(Object.keys(CONTROLS).sort()).toEqual(ids);
    expect(GROUPS.flatMap(([, games]) => games.map((g) => g.id)).sort()).toEqual(ids);
  });
});

describe.each(ids)('%s', (id) => {
  const g = GAMES[id], m = META[id];

  it('has copy, a known dataset when it names one, and a pace unless it is real-time', () => {
    expect(m.skills.length * m.cap.length * m.expert.length).toBeGreaterThan(0);
    if (m.data) expect(DATASETS.map((d) => d.id)).toContain(m.data);
    if (!g.realtime) expect(m.pace).toBeGreaterThan(0);
  });

  it('turns its pad keys into legal moves', () => {
    const s = g.init(3), legal = g.legal(s), played: string[] = [], ctl = CONTROLS[id]();
    let cursor = ctl.sync?.(legal);
    const host: Host = { legal, data: g.data(s), get cursor() { return cursor; }, set: (c) => { cursor = c; }, play: (a) => played.push(a) };
    expect(ctl.hint.length).toBeGreaterThan(0);
    if (cursor !== undefined) expect(legal).toContain(cursor);
    for (const key of ctl.pad.flatMap((p) => (p ? [p[0]] : []))) expect(ctl.down(key, host)).toBe(true);
    if (ctl.act) played.push(ctl.act(host));
    expect(played.every((a) => legal.includes(a))).toBe(true);
  });
});
