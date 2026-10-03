import { block, C, disc, dot, ring, screen, type G, type Pt, type Renderer } from '../frame.ts';

function shape(g: G, kind: string, x: number, y: number, r: number) {
  if (kind === 'circle') disc(g, x, y, r, C.teal);
  else if (kind === 'square') block(g, x - r, y - r, r * 2, C.blue, { inset: 0, r: r * .3 });
  else {
    const pts: Pt[] = kind === 'triangle'
      ? [[x, y - r * 1.05], [x + r, y + r * .8], [x - r, y + r * .8]]
      : Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? .45 : 1.15; return [x + Math.cos(a) * r * k, y + Math.sin(a) * r * k] as Pt; });
    g.fillStyle = kind === 'triangle' ? C.red : C.amber; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill();
  }
}

export const shifting: Renderer = {
  dims: [7, 7],
  draw(g, d, w, h, o) {
    const { cs, X, Y, P } = screen(g, w, h, 7, 7, [['score', String(d.score)], ['step', `${d.steps}/200`]]);
    for (const ob of d.objects as { kind: string; at: Pt }[]) shape(g, ob.kind, ...P(...ob.at), cs * .26);
    const [x, y] = P(...(d.you as Pt));
    disc(g, x, y, cs * .3, C.ink); dot(g, x, y, cs * .1, '#fff');
    if (o.intent === 'take') ring(g, X(d.you[0]), Y(d.you[1]), cs, C.blue);
  },
};
