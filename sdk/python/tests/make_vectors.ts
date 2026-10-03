import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAMES, expertAction, observe } from '../../../packages/engine/src/index.ts';
import { buildPrompt, parseAction, toSystemOne } from '../../../packages/harness/src/index.ts';

const prompts: unknown[] = [];
const add = (g: any, obs: any, history: any[]) => {
  const p = buildPrompt(g, obs, history);
  prompts.push({ game: { id: g.id, name: g.name, rules: g.rules }, obs: { state: obs.text, legalActions: obs.actions }, history, system: p.system, user: p.user, systemOne: toSystemOne(g, obs) });
};

for (const g of Object.values(GAMES)) {
  for (const help of [0, 1, 2] as const) {
    let s = g.init(1);
    const history: { action: string; scoreDelta: number }[] = [];
    for (let step = 0; step <= 45 && !g.done(s); step++) {
      if ([0, 12, 45].includes(step)) add(g, observe(g, s, help), JSON.parse(JSON.stringify(history)));
      const a = expertAction(g, s), before = g.score(s);
      s = g.step(s, a);
      history.push({ action: a, scoreDelta: g.score(s) - before });
    }
  }
}

const synth = { id: 'toy', name: 'Toy', rules: 'Pick one.' };
const odd = [0.0005, 1.0005, 0.0015, 2.0005, -0.0004, 0.1 + 0.2, 1234.5678, 7, -3.14159, 0.9995, 1e-7, 100000.0005];
add(synth, {
  text: 'a\nb',
  actions: [
    { id: 'x', label: 'X', features: {} },
    ...odd.map((v, i) => ({ id: `f${i}`, label: `F${i}`, features: { a: v, b: -v }, outcome: { scoreDelta: v, done: i % 2 === 0 } })),
    { id: 'z', label: 'Z', outcome: { scoreDelta: -0.0004, done: false } },
  ],
}, odd.map((v, i) => ({ action: `m${i}`, scoreDelta: v })));

const legal = ['up', 'down', 'left', 'right', 'hard-drop', 'rot_1', 'c3', 'ſnake'];
const texts = [
  'ACTION: up', 'ACTION: up\nACTION: down', 'ACTION: down\nACTION: nonsense', '**ACTION:** left', 'ACTION = Right', 'Action: `rot_1`',
  'action: "hard-drop"', "ACTION: 'UP'", 'ACTION:*down*', 'ACTION _ : up', 'ACTION **= ** up', 'I think ACTION: left is best.\nACTION: right',
  'ACTION:\n\nup', 'ACTION: up', 'ACTION:﻿up', 'ACTION: up', 'ACTION:\u0085up', 'ACTION\u001c: up', 'ACTION: ſnake', 'ACTION: ſ', 'ACTIOŊ: up',
  'up', '  Up. ', '`down`', '"left"', '**right**', 'right.', '..up..', '*_up_*', '\n\tup\n', '﻿up﻿', 'up\n\n', 'up!', 'I will go up', 'go up\n', '', '   ', 'ACTION:', 'ACTION: ', 'ACTION: c3', 'ACTION: C3\nACTION: C4', 'ACTION: hard-drop-now',
  'ACTION: up down', 'The action is up', 'ACTION up', 'ACTIONS: up', 'REACTION: up', 'ACTION: up', 'x\nACTION: left\nACTION: up\nACTION: bogus',
];
const parse = texts.map((text) => ({ text, legal, expected: parseAction(text, legal) }));
parse.push({ text: 'ACTION: b', legal: ['B', 'b'], expected: parseAction('ACTION: b', ['B', 'b']) });
parse.push({ text: 'ACTION: a', legal: [], expected: parseAction('ACTION: a', []) });

writeFileSync(fileURLToPath(new URL('./vectors.json', import.meta.url)), JSON.stringify({ prompts, parse }));
console.log(`${prompts.length} prompt cases, ${parse.length} parser cases`);
