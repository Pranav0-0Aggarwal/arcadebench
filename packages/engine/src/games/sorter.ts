import sms from './data/sms.json' with { type: 'json' };
import { ITEMS, labelled, type Row } from './labelled.ts';

type Sms = [string, number];
const count = (rows: Row<Sms>[], gold: string, pick: string) => rows.filter((r) => r.gold === gold && r.pick === pick).length;
const caps = (t: string) => { const l = t.replace(/[^A-Za-z]/g, ''); return l ? Math.round((100 * l.replace(/[^A-Z]/g, '').length) / l.length) / 100 : 0; };

export const sorter = labelled<Sms>({
  id: 'sorter', prefix: 'SRT', name: 'Mail Sorter', stream: 20, pool: sms as Sms[],
  rules: `Mail Sorter, a Decision Lab task: ${ITEMS} real text messages from the UCI SMS Spam Collection (CC BY 4.0), drawn by seed from a pool that is half spam and half genuine. For each message, deliver it to the inbox or mark it as spam. One point per message sorted the way the dataset labels it; the expert is that dataset label, so the best possible score is ${ITEMS}.`,
  ask: 'Is this SMS spam?',
  gold: ([, spam]) => (spam ? 'spam' : 'inbox'),
  opts: () => ['inbox', 'spam'],
  label: (_i, a) => (a === 'spam' ? 'mark as spam' : 'deliver to inbox'),
  feats: ([t]) => ({ hasUrl: +/https?:\/\/|www\.|\w\.(com|net|org|co\.uk)\b/i.test(t), hasPhoneNumber: +/\d{9,}/.test(t.replace(/[ -]/g, '')), hasMoney: +/[£$€]/.test(t), capsShare: caps(t) }),
  text: ([t]) => `Text message:\n${t}`,
  view: ([text]) => ({ text }),
  tally: (rows) => ({ inbox: rows.filter((r) => r.pick === 'inbox').length, spam: rows.filter((r) => r.pick === 'spam').length, caught: count(rows, 'spam', 'spam'), missed: count(rows, 'spam', 'inbox'), falseAlarms: count(rows, 'inbox', 'spam') }),
});
