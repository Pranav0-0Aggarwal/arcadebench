import { C, fresh, intent, SANS, text, type Pt, type Renderer } from '../frame.ts';
import { paragraph, scene, spot } from '../lab.ts';
import { bin, box, card, chute, oops, TINT } from '../parts.ts';

const dims: Pt = [10, 9], BINS = [['inbox', 'Inbox', C.teal, 100], ['spam', 'Spam', C.red, 300]] as const;

export const sorter: Renderer = {
  dims,
  draw(g, d, w, h, o) {
    scene(g, w, h, dims, d, () => {
      const last = d.last && fresh(o, 1500) ? d.last : null, on = BINS.findIndex((b) => b[0] === o.intent);
      card(g, 40, 12, 320, 122, 'text message');
      if (d.item) paragraph(g, d.item.text, 54, 46, 292, 16, 5, `600 13px ${SANS}`, C.ink);
      else text(g, `finished: ${d.correct} of ${d.answered} right`, 200, 73, `700 16px ${SANS}`, C.ink, 'center', 'middle');
      chute(g, 200, 134, 168, 210, 100);
      BINS.forEach(([id, label, col, cx], i) => {
        const hit = last?.pick === id;
        bin(g, cx - 75, 222, 150, label, d[id], col, hit ? (last.right ? TINT.good : TINT.bad) : '#fff');
        if (i === on) box(g, cx - 79, 218, 158, 92, 13, undefined, C.blue);
        if (hit) text(g, last.right ? '+1' : 'oops', i ? 372 : 28, 214, `800 22px ${SANS}`, last.right ? C.teal : C.red, i ? 'right' : 'left');
      });
      oops(g, 200, 326, d.answered - d.correct);
      if (on >= 0) intent(g, [[200, 134], [200, 168], [BINS[on][3], 214]], o.t ?? 0, C.blue);
    });
  },
  hit: (_d, w, h, x, y) => { const [px, py] = spot(dims, w, h, x, y); return py < 134 ? null : BINS[+(px > 200)][0]; },
};
