import { describe, expect, it } from 'vitest';
import { expertPolicy, gameContract, play } from '../core/contract.ts';
import { observe } from '../core/observe.ts';
import { CAPS, GAMES, INBOX, LAB } from '../index.ts';
import bfcl from './data/bfcl.json' with { type: 'json' };
import msgs from './data/inbox.json' with { type: 'json' };
import paysim from './data/paysim.json' with { type: 'json' };
import sms from './data/sms.json' with { type: 'json' };
import { checkpoint } from './checkpoint.ts';
import { inbox } from './inbox.ts';
import { ITEMS } from './labelled.ts';
import { sorter } from './sorter.ts';
import { switchboard } from './switchboard.ts';

const swap = (list: string[]) => (v: string) => list[list.length - 1 - list.indexOf(v)];
const flips: Record<string, () => void> = {
  inbox: () => (msgs as string[][]).forEach((r) => { r[2] = swap(INBOX.types)(r[2]); if (r[3]) r[3] = swap(INBOX.cats)(r[3]); }),
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
    const cap = g === inbox ? 2 * ITEMS : ITEMS;
    expect([g.maxSteps, CAPS[g.id], GAMES[g.id]]).toEqual([cap, cap, g]);
    expect(g.valuesExact && g.hidesOutcomes && !!g.ask).toBe(true);
    for (let seed = 0; seed < 5; seed++) {
      const run = play(g, seed, expertPolicy(g));
      expect([run.score, g.done(run.s)]).toEqual([run.actions.length, true]);
      expect(run.score).toBeGreaterThanOrEqual(ITEMS);
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

const gold = (s: ReturnType<typeof inbox.init>) => { const v = inbox.values(s); return Object.keys(v).find((a) => v[a] === 1); };

describe('SMS Inbox', () => {
  const type = (s: ReturnType<typeof inbox.init>) => gold(s)!;
  it('asks the category only after expense, whatever the message is, then moves to the next message', () => {
    let s = inbox.init(3);
    expect(inbox.legal(s)).toEqual(INBOX.types);
    expect(inbox.asked!(s)).toBe('What kind of text message is this?');
    s = inbox.step(s, 'expense');
    expect(inbox.legal(s)).toEqual(INBOX.cats);
    expect(inbox.asked!(s)).toBe('Which spending category is this expense?');
    expect(inbox.render(s)).toMatch(/\n\nWhich spending category is this expense\?\n\nitem 1 of 300, 0 right so far$/);
    expect((inbox.data(s) as { open: string }).open).toBe('expense');
    s = inbox.step(s, 'food');
    expect([inbox.legal(s), (inbox.data(s) as { open: unknown; answered: number }).open, (inbox.data(s) as { answered: number }).answered]).toEqual([INBOX.types, null, 1]);
    expect(observe(inbox, s, 0).ask).toBe('What kind of text message is this?');
    expect(observe(sorter, sorter.init(1), 0)).not.toHaveProperty('ask');
    expect(() => inbox.step(s, 'food')).toThrow();
  });
  it('scores a point for the type and one for the category on true expenses only', () => {
    const run = (pick: (s: ReturnType<typeof inbox.init>, g: string) => string[]) => {
      const total: number[] = [];
      for (let seed = 0; seed < 8; seed++) {
        let s = inbox.init(seed), before = 0;
        while (!inbox.done(s)) {
          const g = type(s), moves = pick(s, g);
          for (const m of moves) s = inbox.step(s, m);
          total.push(inbox.score(s) - before);
          before = inbox.score(s);
        }
      }
      return total;
    };
    const next = (s: ReturnType<typeof inbox.init>, g: string) => (g === 'expense' ? [g, type(inbox.step(s, g))] : [g]);
    const expert = run(next), wrongCat = run((s, g) => (g === 'expense' ? [g, inbox.legal(inbox.step(s, g)).find((c) => c !== type(inbox.step(s, g)))!] : [g]));
    expect(new Set(expert)).toEqual(new Set([1, 2]));
    expect(wrongCat.filter((p) => p === 2)).toHaveLength(0);
    expect(wrongCat.filter((p) => p === 1)).toHaveLength(expert.length);
    const fake = (s: ReturnType<typeof inbox.init>, g: string) => (g === 'expense' ? ['spam'] : ['expense', 'food']);
    expect(run(fake).every((p) => p === 0 || p === 1)).toBe(true);
  });
  it('gives no point for a category picked on a message that is not an expense', () => {
    let s = inbox.init(5);
    while (type(s) === 'expense') { s = inbox.step(s, 'expense'); s = inbox.step(s, type(s)); }
    const before = inbox.score(s), open = inbox.step(s, 'expense');
    expect(Object.values(inbox.values(open))).toEqual(Array(INBOX.cats.length).fill(0));
    expect(inbox.score(inbox.step(open, 'food'))).toBe(before);
  });
  it('shows the same category question for every message', () => {
    const shown = () => seeds.map((seed) => { const s = inbox.step(inbox.init(seed), 'expense'); return JSON.stringify([inbox.render(s), inbox.data(s), inbox.legal(s).map((a) => [a, inbox.label!(s, a), inbox.features!(s, a)]), inbox.asked!(s)]); }), a = shown();
    flips.inbox();
    try { expect(shown()).toEqual(a); } finally { flips.inbox(); }
  });
  it('has one type per message, a category only on expenses, no duplicate text and no tiny class', () => {
    const rows = msgs as string[][], count = (k: string, i: number) => rows.filter((r) => r[i] === k).length;
    expect(rows.every((r) => INBOX.types.includes(r[2]) && (r[2] === 'expense' ? INBOX.cats.includes(r[3]) : r.length === 3))).toBe(true);
    expect(new Set(rows.map((r) => r[1].toLowerCase())).size).toBe(rows.length);
    expect(Math.min(...INBOX.types.map((t) => count(t, 2) / rows.length))).toBeGreaterThan(.06);
    expect(Math.min(...INBOX.cats.map((c) => count(c, 3)))).toBeGreaterThanOrEqual(40);
  });
  it('reports tallies and the most common mistake without the next label', () => {
    let s = inbox.init(2);
    for (let i = 0; i < 12; i++) s = inbox.step(s, i % 2 ? 'spam' : 'otp');
    const d = inbox.data(s) as { n: Record<string, number>; miss: [string, string, number] | null; open: string | null };
    expect([d.n.spam, d.n.otp, d.open]).toEqual([6, 6, null]);
    expect(d.miss).toEqual(expect.arrayContaining([expect.any(String), expect.any(String), expect.any(Number)]));
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
