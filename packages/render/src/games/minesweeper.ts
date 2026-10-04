import { block, cellAt, C, dot, ring, SANS, screen, text, type Renderer } from '../frame.ts';

const NUM = [C.ink, C.blue, C.teal, C.red, C.purple, C.amber, C.ink2, C.ink2, C.ink2];

export const minesweeper: Renderer = {
  dims: [16, 16],
  draw(g, d, w, h, o) {
    const marks = new Set(o.marks), boom: number[] | undefined = d.boom;
    const { cs, X, Y, P } = screen(g, w, h, 16, 16, [['revealed', `${d.revealed}/216`], ['mines', String(d.mines - marks.size)], ...(d.lost ? [['result', 'mine'] as [string, string]] : [])], { dots: false });
    d.cells.forEach((row: number[], y: number) => row.forEach((v, x) => {
      const [cx, cy] = P(x, y);
      if (v === -2) {
        const hot = boom?.[0] === x && boom[1] === y;
        if (hot) block(g, X(x), Y(y), cs, C.red, { inset: .8, r: cs * .14, flat: true });
        return dot(g, cx, cy, cs * .22, hot ? '#fff' : C.ink);
      }
      if (v < 0) {
        block(g, X(x), Y(y), cs, C.cover, { inset: .8, r: cs * .14 });
        if (!marks.has(`r${y}c${x}`)) return;
        g.fillStyle = C.red; g.beginPath(); g.moveTo(cx - cs * .14, cy - cs * .26); g.lineTo(cx + cs * .2, cy - cs * .12); g.lineTo(cx - cs * .14, cy + cs * .02); g.fill();
        g.fillRect(cx - cs * .16, cy - cs * .26, cs * .05, cs * .5);
        return;
      }
      if (v) text(g, String(v), cx, cy + 1, `700 ${cs * .5}px ${SANS}`, NUM[v], 'center', 'middle');
    }));
    const m = o.intent && /^r(\d+)c(\d+)$/.exec(o.intent);
    if (m) ring(g, X(+m[2]), Y(+m[1]), cs, d.lost ? C.red : C.blue);
  },
  hit(_d, w, h, x, y) {
    const c = cellAt(w, h, 16, 16, x, y);
    return c && `r${c[1]}c${c[0]}`;
  },
};
