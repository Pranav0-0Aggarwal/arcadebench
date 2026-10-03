import { C, dot, intent, screen, type Pt, type Renderer } from '../frame.ts';

export const snake: Renderer = {
  dims: [16, 12],
  draw(g, d, w, h, o) {
    const { cs, P } = screen(g, w, h, 16, 12, [['length', String(d.body.length)], ['apples', String(d.apples)]]);
    const body: Pt[] = d.body, [hx, hy]: Pt = d.heading, n = body.length;
    if (d.apple) {
      const [x, y] = P(...(d.apple as Pt));
      dot(g, x, y + cs * .04, cs * .3, C.red);
      g.fillStyle = C.teal; g.beginPath(); g.ellipse(x + cs * .1, y - cs * .3, cs * .13, cs * .06, -.6, 0, 7); g.fill();
    }
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = C.teal;
    for (let j = 1; j < n; j++) { g.lineWidth = cs * (.34 + .3 * (1 - j / n)); g.beginPath(); g.moveTo(...P(...body[j - 1])); g.lineTo(...P(...body[j])); g.stroke(); }
    const [x, y] = P(...body[0]);
    dot(g, x, y, cs * .36, C.ink);
    for (const s of [-1, 1]) dot(g, x + hx * cs * .14 - hy * s * cs * .15, y + hy * cs * .14 + hx * s * cs * .15, cs * .07, '#fff');
    const v: Pt | undefined = o.intent === 'left' ? [hy, -hx] : o.intent === 'right' ? [-hy, hx] : o.intent === 'straight' ? [hx, hy] : undefined;
    if (v) intent(g, [[x, y], [x + v[0] * cs * 1.2, y + v[1] * cs * 1.2]], o.t ?? 0, C.blue);
  },
};
