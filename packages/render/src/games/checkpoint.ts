import { C, MONO, text, type Renderer } from '../frame.ts';
import { face, N, two } from '../lab.ts';

const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const checkpoint: Renderer = two({
  note: 'transaction · before → after',
  gate: true,
  bins: [['allow', 'Let through', C.teal], ['flag', 'Flag', C.red]],
  hud: (d) => [['right', `${d.correct}/${d.answered}`], ['item', `${Math.min(d.answered + 1, N)}/${N}`]],
  count: (d, id) => (id === 'flag' ? d.flagged : d.allowed),
  body(g, t, x, y, w, cs) {
    text(g, t.type.replace('_', ' '), x, y, face(cs, .34, 800), C.ink2, 'left', 'top');
    text(g, money(t.amount), x, y + cs * .5, face(cs, .56, 700, MONO), C.ink, 'left', 'top');
    ([['from', t.before, t.after], ['to', t.destBefore, t.destAfter]] as const).forEach(([who, a, b], i) => {
      const ty = y + cs * (1.5 + i * .55);
      text(g, who, x, ty, face(cs, .27, 400, MONO), C.ink2, 'left', 'top');
      text(g, `${money(a)} → ${money(b)}`, x + w, ty, face(cs, .26, 500, MONO), C.ink, 'right', 'top');
    });
  },
  say: (pick, right) => (right ? (pick === 'flag' ? ['CAUGHT', C.teal] : ['CLEARED', C.teal]) : pick === 'flag' ? ['FALSE ALARM', C.amber] : ['MISSED', C.red]),
});
