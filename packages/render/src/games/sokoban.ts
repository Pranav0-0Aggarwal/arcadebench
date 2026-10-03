import { block, C, DIR, disc, dot, intent, screen, type Pt, type Renderer } from '../frame.ts';

export const sokoban: Renderer = {
  dims: [8, 8],
  draw(g, d, w, h, o) {
    const { cs, X, Y, P } = screen(g, w, h, 8, 8, [['puzzle', `${d.puzzle}/4`], ['moves', `${d.moves}/60`], ['score', String(Math.round(d.score))]]);
    const targets: Pt[] = d.targets, on = (x: number, y: number) => targets.some((t) => t[0] === x && t[1] === y);
    for (const [x, y] of d.walls as Pt[]) block(g, X(x), Y(y), cs, C.stone, { inset: .6, r: cs * .14 });
    for (const [x, y] of targets) { const [gx, gy] = P(x, y); g.strokeStyle = C.red; g.lineWidth = 1.6; g.beginPath(); g.arc(gx, gy, cs * .2, 0, 7); g.stroke(); dot(g, gx, gy, cs * .06, C.red); }
    for (const [x, y] of d.boxes as Pt[]) {
      const i = cs * .26;
      block(g, X(x), Y(y), cs, on(x, y) ? C.teal : C.amber, { r: cs * .12 });
      g.strokeStyle = 'rgba(16,20,28,.22)'; g.lineWidth = 1; g.strokeRect(X(x) + i, Y(y) + i, cs - 2 * i, cs - 2 * i);
    }
    const [px, py] = P(...(d.player as Pt));
    disc(g, px, py, cs * .3, C.blue); dot(g, px + cs * .13, py, cs * .07, '#fff');
    const v = o.intent && DIR[o.intent];
    if (v) intent(g, [[px, py], [px + v[0] * cs * 1.3, py + v[1] * cs * 1.3]], o.t ?? 0, C.ink2);
  },
};
