import { C, type Renderer } from '../frame.ts';
import { face, N, paragraph, two } from '../lab.ts';

export const sorter: Renderer = two({
  note: 'text message',
  bins: [['inbox', 'Inbox', C.teal], ['spam', 'Spam', C.red]],
  hud: (d) => [['right', `${d.correct}/${d.answered}`], ['item', `${Math.min(d.answered + 1, N)}/${N}`]],
  count: (d, id) => d[id],
  body: (g, item, x, y, w, cs) => paragraph(g, item.text, x, y, w, cs * .42, 6, face(cs, .31, 600), C.ink),
  say: (_pick, right) => (right ? ['+1', C.teal] : ['oops', C.red]),
});
