import { C, dot, fresh, intent, MONO, SANS, text, type Pt, type Renderer } from '../frame.ts';
import { scene, spot } from '../lab.ts';
import { bin, belt, box, card, gate, HAIR, TINT, verdict } from '../parts.ts';

const dims: Pt = [13, 9], BY = 172, GX = 330, BX = 366, BINS = [['allow', 'Let through', C.teal, 130], ['flag', 'Flag', C.red, 250]] as const;
const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const say = (pick: string, right: boolean): [string, string] => (right ? [pick === 'flag' ? 'CAUGHT' : 'CLEARED', C.teal] : pick === 'flag' ? ['FALSE ALARM', C.amber] : ['MISSED', C.red]);

export const checkpoint: Renderer = {
  dims,
  draw(g, d, w, h, o) {
    scene(g, w, h, dims, d, () => {
      const last = d.last && fresh(o, 1500) ? d.last : null, on = BINS.findIndex((b) => b[0] === o.intent), t = d.item;
      card(g, 14, 16, 282, 142, 'transaction · before → after');
      if (t) {
        text(g, t.type.replace('_', ' '), 28, 50, `800 12px ${SANS}`, C.ink2, 'left', 'top');
        text(g, money(t.amount), 28, 66, `700 24px ${MONO}`, C.ink, 'left', 'top');
        ([['from', t.before, t.after], ['to', t.destBefore, t.destAfter]] as const).forEach(([who, a, b], i) => {
          text(g, who, 28, 106 + i * 22, `10.5px ${MONO}`, C.ink2, 'left', 'top');
          text(g, `${money(a)} → ${money(b)}`, 282, 106 + i * 22, `500 10.5px ${MONO}`, C.ink, 'right', 'top');
        });
      } else text(g, `finished: ${d.correct} of ${d.answered} right`, 155, 87, `700 16px ${SANS}`, C.ink, 'center', 'middle');
      belt(g, 14, BY, BX - 14, o.t ?? 0);
      g.strokeStyle = HAIR; g.lineWidth = 2;
      g.beginPath(); g.moveTo(GX, BY + 4); g.lineTo(GX, 292); g.lineTo(BX, 292); g.stroke();
      gate(g, GX, BY, (o.intent ?? last?.pick) === 'flag');
      BINS.forEach(([id, label, col, y], i) => {
        bin(g, BX, y, 140, label, id === 'flag' ? d.flagged : d.allowed, col, last?.pick === id ? (last.right ? TINT.good : TINT.bad) : '#fff');
        if (i === on) box(g, BX - 4, y - 4, 148, 92, 13, undefined, C.blue);
      });
      if (last) verdict(g, BX + 70, 232, ...say(last.pick, last.right));
      ([['caught', d.caught, C.teal], ['missed', d.missed, C.red], ['false alarms', d.falseFlags, C.amber]] as const).forEach(([k, n, col], i) => {
        dot(g, 19, 248 + i * 26, 5, col);
        text(g, `${k} ${n}`, 32, 253 + i * 26, `13px ${MONO}`, C.ink2);
      });
      if (on >= 0) intent(g, on ? [[GX - 90, BY], [GX, BY], [GX, 292], [BX - 2, 292]] : [[GX - 90, BY], [BX - 2, BY]], o.t ?? 0, C.blue);
    });
  },
  hit(_d, w, h, x, y) {
    const [px, py] = spot(dims, w, h, x, y);
    return px < 306 ? null : BINS[+(py > 232)][0];
  },
};
