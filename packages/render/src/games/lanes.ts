import { block, C, dot, disc, intent, rp, screen, type Pt, type Renderer } from '../frame.ts';

const depth = (k: number) => .97 - .094 * k;

export const lanes: Renderer = {
  dims: [16, 9],
  draw(g, d, w, h, o) {
    const { cs, X, Y } = screen(g, w, h, 16, 9, [['row', `${d.row}/600`], ['coins', String(d.coins)]], { dots: false });
    const W2 = cs * 16, H2 = cs * 9, ox = X(0), oy = Y(0), vx = ox + W2 / 2, vy = oy + H2 * .04, bot = oy + H2;
    const xAt = (f: number, y: number) => vx + f * (W2 * .5) * (y - vy) / (bot - vy), Yd = (k: number) => vy + (bot - vy) * depth(k) ** 2, laneX = (l: number, y: number) => xAt((l - 1) * 2 / 3, y);
    g.save(); rp(g, ox, oy, W2, H2, 6); g.clip();
    [-1, -1 / 3, 1 / 3].forEach((f, i) => { g.fillStyle = i === 1 ? '#f3f5f8' : '#fafbfc'; g.beginPath(); g.moveTo(vx, vy); g.lineTo(xAt(f, bot), bot); g.lineTo(xAt(f + 2 / 3, bot), bot); g.closePath(); g.fill(); });
    g.lineWidth = 1;
    g.strokeStyle = C.grid;
    for (let k = 0; k <= 8; k++) { const y = Yd(k + .5); g.beginPath(); g.moveTo(xAt(-1, y), y); g.lineTo(xAt(1, y), y); g.stroke(); }
    for (const f of [-1 / 3, 1 / 3]) { g.beginPath(); g.moveTo(vx, vy); g.lineTo(xAt(f, bot), bot); g.stroke(); }
    g.strokeStyle = C.ink2; g.lineWidth = 1.2;
    for (const f of [-1, 1]) { g.beginPath(); g.moveTo(vx, vy); g.lineTo(xAt(f, bot), bot); g.stroke(); }
    const ahead: string[] = d.ahead;
    for (let k = ahead.length; k >= 1; k--) {
      const y = Yd(k), lw = laneX(2, y) - laneX(1, y), s = lw * .78;
      [...ahead[k - 1]].forEach((ch, l) => {
        const cx = laneX(l, y);
        if (ch === 'W') block(g, cx - s / 2, y - s * .95, s, C.ink2, { inset: 0, r: s * .12 });
        else if (ch === 'L') { g.fillStyle = C.amber; rp(g, cx - s / 2, y - s * .22, s, s * .22, s * .05); g.fill(); }
        else if (ch === 'H') { g.strokeStyle = C.red; g.lineWidth = Math.max(1.5, s * .08); g.beginPath(); g.moveTo(cx - s / 2, y); g.lineTo(cx - s / 2, y - s * .7); g.lineTo(cx + s / 2, y - s * .7); g.lineTo(cx + s / 2, y); g.stroke(); }
        else if (ch === 'C') dot(g, cx, y - s * .25, Math.max(1.5, s * .16), C.amber);
      });
    }
    const y0 = Yd(0), s0 = (laneX(2, y0) - laneX(1, y0)) * .55, rx = laneX(d.lane, y0);
    g.fillStyle = C.blue; rp(g, rx - s0 * .4, y0 - s0 * 1.1, s0 * .8, s0 * 1.1, s0 * .38); g.fill();
    disc(g, rx, y0 - s0 * 1.25, s0 * .3, C.ink);
    const a = o.intent, t = o.t ?? 0;
    if (a === 'left' || a === 'right') { const y1 = Yd(1); intent(g, [[rx, y0 - s0 * 1.6], [laneX(d.lane + (a === 'left' ? -1 : 1), y1), y1 - s0]], t, C.blue); }
    else if (a === 'jump') intent(g, [[rx, y0 - s0 * 1.8], [rx, y0 - s0 * 2.8]] as Pt[], t, C.blue);
    else if (a === 'slide') intent(g, [[rx, y0 - s0 * 2.8], [rx, y0 - s0 * 1.8]] as Pt[], t, C.blue);
    g.restore();
  },
};
