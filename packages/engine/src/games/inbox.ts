import msgs from './data/inbox.json' with { type: 'json' };
import { ITEMS, labelled, type Row } from './labelled.ts';

type Msg = [string, string, string, string?];
const TYPES: Record<string, string> = {
  otp: 'a one-time or verification code', expense: 'money you spent or sent out', income: 'money received: salary, refund, cashback, a transfer in', bill: 'a bill generated or a payment due reminder',
  delivery: 'an order, parcel or pickup update', alert: 'a security, login, appointment or travel or booking notice', personal: 'a message from a person', promo: 'legitimate marketing or an offer', spam: 'a scam, phishing, lottery or fake KYC message',
};
const CATS: Record<string, string> = {
  food: 'dining and food delivery', groceries: 'groceries', shopping: 'shopping', transport: 'cabs, fuel, metro, parking', travel: 'flights, trains, hotels', bills: 'utilities, phone, broadband, rent, insurance, credit card payments',
  entertainment: 'entertainment', health: 'health', transfer: 'money sent to a person', other: 'anything else',
};
export const INBOX = { types: Object.keys(TYPES), cats: Object.keys(CATS) };
const bump = (n: Record<string, number>, k: string) => { n[k] = (n[k] ?? 0) + 1; };

export const inbox = labelled({
  id: 'inbox', prefix: 'INB', name: 'SMS Inbox', stream: 23, pool: msgs as Msg[],
  rules: `SMS Inbox, a Decision Lab task: ${ITEMS} text messages drawn by seed from a pool of about ${Math.round(msgs.length / 100) * 100} generated Indian and US messages and real ones from the UCI SMS Spam Collection (CC BY 4.0). Step 1: pick the type of each message: ${Object.entries(TYPES).map(([k, v]) => `${k} (${v})`).join(', ')}. Step 2: whenever you pick expense, a second question asks for the spending category: ${Object.entries(CATS).map(([k, v]) => `${k} (${v})`).join(', ')}. That question comes even if the message turns out not to be an expense, and then no category point is possible. One point per correct type and one per correct category on true expenses; the expert is the dataset label, so the best possible score is ${ITEMS} plus the number of true expenses in the run.`,
  ask: 'What kind of text message is this?',
  sub: { on: 'expense', ask: 'Which spending category is this expense?', opts: Object.keys(CATS), gold: ([, , , cat]) => cat, label: (_i, a) => CATS[a] },
  gold: ([, , type]) => type,
  opts: () => Object.keys(TYPES),
  label: (_i, a) => TYPES[a],
  feats: ([, t]) => ({
    hasCode: +/\b\d{4,8}\b/.test(t), hasAmount: +/(?:rs\.?|inr|usd|gbp|[₹$£€])\s?\d|\d\s?(?:rs|inr|usd|gbp)\b/i.test(t), hasUrl: +/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|in|io|to|ly|co|net|org|top|xyz|vip|click|info|cc|online|site|icu|link)\b/i.test(t),
    mentionsDebit: +/\b(?:debited|spent|paid|withdrawn|sent|purchase)\b/i.test(t), mentionsCredit: +/\b(?:credited|received|deposited|refund\w*|cashback)\b/i.test(t),
  }),
  text: ([from, t]) => `Text message from ${from}:\n${t}`,
  view: ([from, text]) => ({ from, text }),
  tally(rows: Row<Msg>[]) {
    const n: Record<string, number> = {}, miss: Record<string, number> = {};
    for (const r of rows) for (const [gold, pick] of [[r.gold, r.pick], [r.subGold, r.sub]]) {
      if (!pick) continue;
      bump(n, pick);
      if (gold && gold !== pick) bump(miss, `${gold}>${pick}`);
    }
    const top = Object.entries(miss).sort((a, b) => b[1] - a[1])[0];
    return { n, miss: top ? [...top[0].split('>'), top[1]] : null };
  },
});
