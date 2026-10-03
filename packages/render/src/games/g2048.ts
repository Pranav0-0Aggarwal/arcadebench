import { block, C, DIR, intent, SANS, screen, text, type Renderer } from '../frame.ts';

const TILE: Record<number, [string, string]> = {
  2: ['#eef0ff', C.ink], 4: ['#dfe2fc', C.ink], 8: ['#c3c9f7', C.ink], 16: ['#9aa3f0', C.ink], 32: ['#6f7ae9', '#fff'], 64: [C.blue, '#fff'], 128: ['#2f3bb8', '#fff'],
  256: [C.ink, '#fff'], 512: [C.purple, '#fff'], 1024: [C.teal, '#fff'], 2048: [C.amber, '#fff'],
};

export const g2048: Renderer = {
  dims: [4, 4],
  draw(g, d, w, h, o) {
    const { cs, X, Y, P } = screen(g, w, h, 4, 4, [['score', d.score.toLocaleString('en-US')], ['moves', String(d.moves)]], { dots: false });
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) block(g, X(x), Y(y), cs, '#f1f3f7', { flat: true, r: cs * .14 });
    d.board.forEach((row: number[], y: number) => row.forEach((v, x) => {
      if (!v) return;
      const [bg, fg] = TILE[v] ?? [C.ink, '#fff'], [cx, cy] = P(x, y);
      block(g, X(x), Y(y), cs, bg, { r: cs * .14 });
      text(g, String(v), cx, cy + cs * .03, `700 ${cs * (v >= 1000 ? .28 : v >= 100 ? .32 : .4)}px ${SANS}`, fg, 'center', 'middle');
    }));
    const v = o.intent && DIR[o.intent];
    if (v) intent(g, [P(1.5 - v[0] * 1.3, 1.5 - v[1] * 1.3), P(1.5 + v[0] * 1.3, 1.5 + v[1] * 1.3)], o.t ?? 0, C.blue);
  },
};
