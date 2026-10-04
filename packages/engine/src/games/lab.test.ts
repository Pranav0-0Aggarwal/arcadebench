import { describe, expect, it } from 'vitest';
import { expertPolicy, gameContract, play } from '../core/contract.ts';
import { CAPS, GAMES, LAB } from '../index.ts';
import bfcl from './data/bfcl.json' with { type: 'json' };
import paysim from './data/paysim.json' with { type: 'json' };
import sms from './data/sms.json' with { type: 'json' };
import { checkpoint } from './checkpoint.ts';
import { ITEMS } from './labelled.ts';
import { sorter } from './sorter.ts';
import { switchboard } from './switchboard.ts';

const flips: Record<string, () => void> = {
  sorter: () => (sms as [string, number][]).forEach((r) => { r[1] = 1 - r[1]; }),
  checkpoint: () => (paysim as number[][]).forEach((r) => { r[6] = 1 - r[6]; }),
  switchboard: () => (bfcl as [string, unknown[], number][]).forEach((r) => { r[2] = (r[2] + 1) % r[1].length; }),
};
const seen = (g: (typeof LAB)[number], seed: number) => {
  const s = g.init(seed);
  return JSON.stringify([g.render(s), g.data(s), g.legal(s).map((a) => [a, g.label!(s, a), g.features!(s, a)])]);
};
const seeds = Array.from({ length: 40 }, (_, i) => i);

describe.each(LAB)('$name', (g) => {
  gameContract(g, { seeds: 12, margin: 8, ratio: 1.4 });
  it('is a 300 item episode with exact dataset-label values', () => {
    expect([g.maxSteps, CAPS[g.id], GAMES[g.id]]).toEqual([ITEMS, ITEMS, g]);
    expect(g.valuesExact && g.hidesOutcomes && !!g.ask).toBe(true);
    for (let seed = 0; seed < 5; seed++) {
      const run = play(g, seed, expertPolicy(g));
      expect([run.score, run.actions.length, g.done(run.s)]).toEqual([ITEMS, ITEMS, true]);
      const s = g.init(seed), v = g.values(s);
      expect(Object.values(v).filter((x) => x === 1)).toHaveLength(1);
    }
  });
  it('draws the same items for a seed, and different ones for other seeds', () => {
    expect(seen(g, 4)).toBe(seen(g, 4));
    expect(seen(g, 4)).not.toBe(seen(g, 5));
    const texts = new Set<string>();
    for (let s = g.init(9); !g.done(s); s = g.step(s, g.legal(s)[0])) texts.add(g.render(s).split('\n\nitem')[0]);
    expect(texts.size).toBe(ITEMS);
  });
  it('never leaks the label through the render, data, labels or features', () => {
    const shown = () => seeds.map((seed) => seen(g, seed)), gold = () => seeds.map((seed) => JSON.stringify(g.values(g.init(seed)))), [a, v] = [shown(), gold()];
    flips[g.id]();
    try {
      expect(shown()).toEqual(a);
      expect(gold()).not.toEqual(v);
    } finally { flips[g.id](); }
  });
});

describe('legal ids', () => {
  it('are fixed for the binary tasks', () => {
    expect(sorter.legal(sorter.init(1))).toEqual(['inbox', 'spam']);
    expect(checkpoint.legal(checkpoint.init(1))).toEqual(['allow', 'flag']);
  });
  it('are the function names for the switchboard, short and parseable', () => {
    for (const [, fns, gold] of bfcl as [string, [string, string][], number][]) {
      expect(fns.length).toBeGreaterThanOrEqual(2);
      expect(fns[gold]).toBeTruthy();
      expect(new Set(fns.map(([n]) => n)).size).toBe(fns.length);
      for (const [n] of fns) expect(n).toMatch(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/);
      for (const [n] of fns) expect(n.length).toBeLessThanOrEqual(64);
    }
    for (let seed = 0; seed < 5; seed++) {
      const s = switchboard.init(seed), d = switchboard.data(s) as { item: { fns: { name: string }[] } };
      expect(switchboard.legal(s)).toEqual(d.item.fns.map((f) => f.name));
    }
  });
});

describe('what the observation shows', () => {
  it('lists the message, the transaction or the request with numbered functions, then progress', () => {
    expect(sorter.render(sorter.init(1))).toMatch(/^Text message:\n.+\n\nitem 1 of 300, 0 right so far$/);
    expect(checkpoint.render(checkpoint.init(1))).toMatch(/^Transaction: [A-Z_]+ of [\d,.]+\nSender balance: .+\nRecipient balance: .+\n\nitem 1 of 300, 0 right so far$/);
    expect(switchboard.render(switchboard.init(1))).toMatch(/^Request: .+\n\nFunctions:\n1\. [\w.-]+: .+\n2\. /);
  });
  it('reports the last answer and the class tallies without the next label', () => {
    let s = sorter.init(2);
    const first = sorter.values(s), gold = Object.keys(first).find((a) => first[a] === 1)!;
    s = sorter.step(s, gold);
    const d = sorter.data(s) as Record<string, number>;
    expect(d).toMatchObject({ answered: 1, correct: 1, last: { right: true } });
    expect(d.caught + d.inbox + d.spam).toBeGreaterThan(0);
  });
});
