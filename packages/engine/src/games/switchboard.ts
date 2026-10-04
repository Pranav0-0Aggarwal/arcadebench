import bfcl from './data/bfcl.json' with { type: 'json' };
import { ITEMS, labelled } from './labelled.ts';

type Call = [string, [string, string][], number];
const words = (s: string) => new Set(s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-z]{3,}/g));
const shared = (a: string, b: string) => { const w = words(b); return [...words(a)].filter((x) => w.has(x)).length; };
const fn = ([, fns]: Call, a: string) => fns.find(([n]) => n === a)!;

export const switchboard = labelled<Call>({
  id: 'switchboard', prefix: 'SWB', name: 'Switchboard', stream: 21, pool: bfcl as Call[],
  rules: `Switchboard, a Decision Lab task: ${ITEMS} user requests from the Berkeley Function Calling Leaderboard v3 (Apache-2.0), drawn by seed. Each request comes with two to six candidate functions and their descriptions. Call the one function that fits the request; the action id is the function name. One point per request answered with the dataset's reference function; the expert is that reference, so the best possible score is ${ITEMS}.`,
  ask: 'Which function should be called for this request?',
  gold: ([, fns, g]) => fns[g][0],
  opts: ([, fns]) => fns.map(([n]) => n),
  label: (i, a) => `call ${a}: ${fn(i, a)[1]}`,
  feats: (i, a) => ({ nameOverlap: shared(i[0], a), descOverlap: shared(i[0], fn(i, a)[1]) }),
  text: ([req, fns]) => `Request: ${req}\n\nFunctions:\n${fns.map(([n, d], k) => `${k + 1}. ${n}: ${d}`).join('\n')}`,
  view: ([request, fns]) => ({ request, fns: fns.map(([name, desc]) => ({ name, desc })) }),
});
