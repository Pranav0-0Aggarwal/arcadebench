import { C, dot, fresh, MONO, SANS, text, type Pt, type Renderer } from '../frame.ts';
import { paragraph, scene, spot } from '../lab.ts';
import { card, HAIR, lamp, oops, plug, spark, trunc, verdict, wire } from '../parts.ts';

const dims: Pt = [14, 10], JX = 164, JY = 134, PX = 236, PW = 310;
const lay = (n: number) => { const p = Math.min(80, 352 / n); return [p, 24 + (352 - n * p) / 2, Math.min(60, p - 8)] as const; };

export const switchboard: Renderer = {
  dims,
  draw(g, d, w, h, o) {
    scene(g, w, h, dims, d, () => {
      card(g, 14, 24, 150, 220, 'user request');
      const last = d.last && fresh(o, 1500) ? d.last : null;
      if (last) {
        verdict(g, 89, 276, last.right ? '+1' : 'oops', last.right ? C.teal : C.red);
        g.font = `11px ${MONO}`;
        text(g, trunc(g, last.pick, 142), 89, 308, g.font, C.ink2, 'center');
      }
      oops(g, 89, 356, d.answered - d.correct);
      if (!d.item) return text(g, `finished: ${d.correct} of ${d.answered} right`, 89, 134, `700 14px ${SANS}`, C.ink, 'center', 'middle');
      paragraph(g, d.item.request, 28, 60, 122, 17, 10, `700 13px ${SANS}`, C.ink);
      const fns: { name: string; desc: string }[] = d.item.fns, [p, top, ph] = lay(fns.length), on = fns.findIndex((f) => f.name === o.intent), py = (i: number) => top + i * p + (p - ph) / 2;
      fns.forEach((f, i) => {
        plug(g, PX, py(i), PW, ph, i === on ? C.blue : HAIR);
        g.font = `13px ${MONO}`;
        text(g, trunc(g, f.name, PW - 60), PX + 30, py(i) + 7, g.font, C.ink, 'left', 'top');
        text(g, String(i + 1), PX + PW - 16, py(i) + ph / 2, `500 12px ${MONO}`, C.ink3, 'right', 'middle');
        paragraph(g, f.desc, PX + 30, py(i) + 24, PW - 60, 12, Math.max(1, Math.floor((ph - 26) / 12)), `11px ${SANS}`, C.ink2);
      });
      fns.forEach((_, i) => wire(g, JX, JY, PX + 14, py(i) + ph / 2, HAIR));
      if (on >= 0) {
        g.save(); g.setLineDash([6, 5]); g.lineDashOffset = -(o.t ?? 0) / 45;
        wire(g, JX, JY, PX + 14, py(on) + ph / 2, C.blue);
        g.restore();
      }
      dot(g, JX, JY, 5, HAIR);
      if (last) last.right ? lamp(g, JX, JY, 1) : spark(g, JX, JY, 1, 0);
    });
  },
  hit(d, w, h, x, y) {
    const [px, py] = spot(dims, w, h, x, y), n = d.item?.fns.length;
    return n && px > JX ? d.item.fns[Math.floor((py - lay(n)[1]) / lay(n)[0])]?.name ?? null : null;
  },
};
