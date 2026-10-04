import { C, frame, fresh, intent, MONO, rp, screen, text, type Renderer } from '../frame.ts';
import { card, clip, face, N, paragraph } from '../lab.ts';

const ROWS = 12, TOP = 3.3;
const height = (n: number) => Math.min(2.4, (ROWS - TOP - .2) / n);

export const switchboard: Renderer = {
  dims: [8, ROWS],
  draw(g, d, w, h, o) {
    const { cs, X, Y } = screen(g, w, h, 8, ROWS, [['right', `${d.correct}/${d.answered}`], ['item', `${Math.min(d.answered + 1, N)}/${N}`]], { surface: false });
    card(g, X(.4), Y(.3), 7.2 * cs, 2.5 * cs, cs, 'user request');
    if (!d.item) return text(g, `finished: ${d.correct} of ${d.answered} right`, X(4), Y(1.55), face(cs, .42, 700), C.ink, 'center', 'middle');
    const long = d.item.request.length > 110, size = long ? .26 : .31, lh = cs * size * 1.35, fns: { name: string; desc: string }[] = d.item.fns, rh = height(fns.length) * cs, pick = fns.findIndex((f) => f.name === o.intent);
    paragraph(g, d.item.request, X(.7), Y(.3) + cs * .7, 6.6 * cs, lh, Math.floor(1.75 * cs / lh), face(cs, size, 600), C.ink);
    if (d.last && fresh(o, 1500)) text(g, `${d.last.right ? '+1' : 'oops'} · ${clip(g, d.last.pick, 6 * cs, face(cs, .26, 500, MONO))}`, X(.5), Y(3.05), face(cs, .26, 500, MONO), d.last.right ? C.teal : C.red, 'left', 'middle');
    fns.forEach((f, i) => {
      const y = Y(TOP) + i * rh, on = i === pick;
      g.fillStyle = '#fff'; rp(g, X(.4), y + 2, 7.2 * cs, rh - 4, cs * .2); g.fill(); g.strokeStyle = on ? C.blue : C.dot; g.lineWidth = on ? 2 : 1.5; g.stroke();
      g.strokeStyle = C.ink3; g.lineWidth = 1.2; g.beginPath(); g.arc(X(.95), y + rh / 2, cs * .22, 0, 7); g.stroke();
      text(g, String(i + 1), X(.95), y + rh / 2, face(cs, .24, 500, MONO), C.ink2, 'center', 'middle');
      text(g, clip(g, f.name, 5.7 * cs, face(cs, .27, 700, MONO)), X(1.5), y + 5, face(cs, .27, 700, MONO), C.ink, 'left', 'top');
      const dy = y + 5 + cs * .4, dh = cs * .3;
      paragraph(g, f.desc, X(1.5), dy, 5.7 * cs, dh, Math.max(1, Math.floor((y + rh - 4 - dy) / dh)), face(cs, .23), C.ink2);
    });
    if (pick >= 0) intent(g, [[X(.95), Y(2.8)], [X(.95), Y(TOP) + pick * rh + rh / 2 - cs * .25]], o.t ?? 0, C.blue);
  },
  hit(d, w, h, x, y) {
    const f = frame(w, h, 8, ROWS), i = Math.floor((y - f.Y(TOP)) / (height(d.item?.fns.length ?? 1) * f.cs));
    return d.item?.fns[i]?.name ?? null;
  },
};
