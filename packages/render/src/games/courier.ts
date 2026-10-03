import { block, C, DIR, dot, intent, MONO, ring, rp, screen, text, type Pt, type Renderer } from '../frame.ts';

const MOVE: Record<string, Pt> = { north: DIR.up, south: DIR.down, west: DIR.left, east: DIR.right };
interface Order { id: number; from?: Pt; to: Pt; due: number }

export const courier: Renderer = {
  dims: [9, 9],
  draw(g, d, w, h, o) {
    const { cs, X, Y, P } = screen(g, w, h, 9, 9, [['delivered', String(d.delivered)], ['on time', String(d.onTime)], ['load', `${d.carrying.length}/3`], ['tick', `${d.tick}/300`]], { dots: false });
    for (let x = 1; x < 9; x += 2) for (let y = 1; y < 9; y += 2) block(g, X(x), Y(y), cs, C.cover, { inset: .5, r: cs * .14 });
    for (const [x, y] of d.closed as Pt[]) {
      const [cx, cy] = P(x, y);
      g.strokeStyle = C.red; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - cs * .22, cy - cs * .22); g.lineTo(cx + cs * .22, cy + cs * .22); g.moveTo(cx + cs * .22, cy - cs * .22); g.lineTo(cx - cs * .22, cy + cs * .22); g.stroke();
    }
    const pin = (at: Pt, col: string, due: number) => {
      const [px, py] = P(...at);
      g.fillStyle = col; g.beginPath(); g.arc(px, py - cs * .12, cs * .2, Math.PI, 0); g.lineTo(px, py + cs * .16); g.closePath(); g.fill();
      dot(g, px, py - cs * .12, cs * .07, '#fff');
      text(g, String(due), px, py + cs * .4, `500 ${Math.max(8, cs * .2)}px ${MONO}`, C.ink2, 'center', 'middle');
    };
    for (const k of d.waiting as Order[]) pin(k.from!, C.teal, k.due);
    for (const k of d.carrying as Order[]) pin(k.to, C.purple, k.due);
    const [vx, vy] = P(...(d.van as Pt));
    g.fillStyle = C.ink; rp(g, vx - cs * .3, vy - cs * .22, cs * .6, cs * .44, cs * .1); g.fill();
    g.fillStyle = '#fff'; g.fillRect(vx + cs * .06, vy - cs * .14, cs * .14, cs * .28);
    const v = o.intent && MOVE[o.intent];
    if (v) intent(g, [[vx, vy], [vx + v[0] * cs, vy + v[1] * cs]], o.t ?? 0, C.blue);
    else if (o.intent === 'pickup' || o.intent === 'dropoff') ring(g, X(d.van[0]), Y(d.van[1]), cs, C.blue);
  },
};
