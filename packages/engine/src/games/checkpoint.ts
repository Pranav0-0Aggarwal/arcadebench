import paysim from './data/paysim.json' with { type: 'json' };
import { ITEMS, labelled, type Row } from './labelled.ts';

type Tx = [string, number, number, number, number, number, number];
const count = (rows: Row<Tx>[], gold: string, pick: string) => rows.filter((r) => r.gold === gold && r.pick === pick).length;
const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const checkpoint = labelled<Tx>({
  id: 'checkpoint', prefix: 'CHK', name: 'Checkpoint', stream: 22, pool: paysim as Tx[],
  rules: `Checkpoint, a Decision Lab task: ${ITEMS} transactions from PaySim, a simulation of mobile-money payments (CC BY-SA 4.0), drawn by seed from a pool that is half fraudulent. For each transaction, let the payment through or flag it as fraud. One point per transaction handled the way the dataset labels it; the expert is that dataset label, so the best possible score is ${ITEMS}.`,
  ask: 'Is this transaction fraudulent?',
  gold: (t) => (t[6] ? 'flag' : 'allow'),
  opts: () => ['allow', 'flag'],
  label: (_i, a) => (a === 'flag' ? 'flag as fraud' : 'let the payment through'),
  feats: ([, amount, before, , destBefore, destAfter]) => ({ amount, drainsAccount: +(amount >= before), destBalanceUnchanged: +(destBefore === destAfter) }),
  text: ([type, amount, before, after, destBefore, destAfter]) => `Transaction: ${type} of ${money(amount)}\nSender balance: ${money(before)} before, ${money(after)} after\nRecipient balance: ${money(destBefore)} before, ${money(destAfter)} after`,
  view: ([type, amount, before, after, destBefore, destAfter]) => ({ type, amount, before, after, destBefore, destAfter }),
  tally: (rows) => ({ caught: count(rows, 'flag', 'flag'), missed: count(rows, 'flag', 'allow'), falseFlags: count(rows, 'allow', 'flag'), flagged: rows.filter((r) => r.pick === 'flag').length, allowed: rows.filter((r) => r.pick === 'allow').length }),
});
