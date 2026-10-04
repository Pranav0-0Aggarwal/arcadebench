import { cellAt, C, disc, dot, fresh, rp, SANS, screen, text, type Renderer } from '../frame.ts';

const SAY: Record<number, string> = { 1: 'You win', 0.5: 'Draw', 0: 'Engine wins' };

export const connect4: Renderer = {
  dims: [7, 7],
  draw(g, d, w, h, o) {
    const res: number[] = d.results, { cs, X, Y, P } = screen(g, w, h, 7, 7, [['game', `${Math.min(d.game, 6)}/6`], ['score', String(res.reduce((a, b) => a + b, 0))]], { surface: false });
    g.fillStyle = '#e6eaf0'; rp(g, X(0) - cs * .08, Y(1) - cs * .08, cs * 7.16, cs * 6.16, cs * .3); g.fill();
    const fin: string[] | null = d.finishedBoard && fresh(o, 1500) ? d.finishedBoard : null, rows: string[] = fin ?? d.board;
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const [hx, hy] = P(x, y + 1);
      dot(g, hx, hy, cs * .38, '#fff');
      if (ch !== '.') disc(g, hx, hy, cs * .36, ch === 'X' ? C.blue : C.red);
    }));
    if (fin || d.game > 6) {
      const [x, y] = P(3, 0);
      text(g, `${SAY[res[res.length - 1]]}${d.game > 6 ? ' · match over' : ` · game ${res.length} of 6`}`, x, y, `700 ${Math.max(11, cs * .42)}px ${SANS}`, C.ink, 'center', 'middle');
      return;
    }
    if (d.lastEngineColumn >= 0) { const [x, y] = P(d.lastEngineColumn, 0); dot(g, x, y, cs * .09, C.red); }
    const m = o.intent && /^c([0-6])$/.exec(o.intent);
    if (!m) return;
    const col = +m[1], [x, y] = P(col, 0), b = Math.sin((o.t ?? 0) / 180) * cs * .06;
    g.fillStyle = C.ink; g.beginPath(); g.moveTo(x - cs * .18, y - cs * .12 + b); g.lineTo(x + cs * .18, y - cs * .12 + b); g.lineTo(x, y + cs * .14 + b); g.closePath(); g.fill();
    const row = rows.map((r) => r[col]).lastIndexOf('.');
    if (row >= 0) {
      const [hx, hy] = P(col, row + 1);
      g.save(); g.strokeStyle = C.blue; g.lineWidth = 1.5; g.setLineDash([3, 2.5]); g.beginPath(); g.arc(hx, hy, cs * .36, 0, 7); g.stroke(); g.restore();
    }
  },
  hit(_d, w, h, x, y) {
    const c = cellAt(w, h, 7, 7, x, y);
    return c && `c${c[0]}`;
  },
};
