import { block, cellAt, C, ring, SANS, screen, text, type Renderer } from '../frame.ts';

const NUM = [C.ink, C.blue, C.teal, C.red, C.purple, C.amber, C.ink2, C.ink2, C.ink2];

export const minesweeper: Renderer = {
  dims: [16, 16],
  draw(g, d, w, h, o) {
    const { cs, X, Y, P } = screen(g, w, h, 16, 16, [['revealed', `${d.revealed}/216`], ['mines', String(d.mines)], ...(d.lost ? [['result', 'mine'] as [string, string]] : [])], { dots: false });
    d.cells.forEach((row: number[], y: number) => row.forEach((v, x) => {
      if (v < 0) return block(g, X(x), Y(y), cs, C.cover, { inset: .8, r: cs * .14 });
      if (v) { const [cx, cy] = P(x, y); text(g, String(v), cx, cy + 1, `700 ${cs * .5}px ${SANS}`, NUM[v], 'center', 'middle'); }
    }));
    const m = o.intent && /^r(\d+)c(\d+)$/.exec(o.intent);
    if (m) ring(g, X(+m[2]), Y(+m[1]), cs, d.lost ? C.red : C.blue);
  },
  hit(d, w, h, x, y) {
    const c = cellAt(w, h, 16, 16, x, y);
    return c && `r${c[1]}c${c[0]}`;
  },
};
