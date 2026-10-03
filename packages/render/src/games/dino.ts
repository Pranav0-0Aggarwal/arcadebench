import { C, intent, pix, rp, screen, type G, type Pt, type Renderer } from '../frame.ts';

const REX = ['..........########', '.........##.#######', '.........##########', '.........#####.....', '.........########..', '#.......#####......', '#.....#######......', '##...##########....', '#############.#....', '############.......', '.##########........', '..########.........', '...#######.........', '....##..##.........', '....#....#.........', '....##...##........'];
const CACTUS = ['..##..', '..##.#', '#.##.#', '#.####', '####..', '..##..', '..##..', '..##..'];
const SPAN = 520, STAND: Pt = [44, 47], DUCK: Pt = [59, 26];

function bird(g: G, x: number, y: number, w: number, h: number, flap: boolean) {
  g.fillStyle = C.ink2;
  rp(g, x + w * .15, y + h * .4, w * .7, h * .32, h * .16); g.fill();
  g.beginPath(); g.moveTo(x + w * .18, y + h * .46); g.lineTo(x, y + h * .56); g.lineTo(x + w * .18, y + h * .66); g.fill();
  const tip = flap ? y : y + h;
  g.beginPath(); g.moveTo(x + w * .35, y + h * .5); g.lineTo(x + w * .72, tip); g.lineTo(x + w * .66, y + h * .5); g.fill();
}

export const dino: Renderer = {
  dims: [16, 9],
  draw(g, d, w, h, o) {
    const t = o.t ?? 0, speed = d.speedPxPerFrame as number;
    const { cs, X, Y } = screen(g, w, h, 16, 9, [['score', String(d.score).padStart(5, '0')], ['speed', speed.toFixed(1)]], { dots: false });
    const W2 = cs * 16, H2 = cs * 9, ox = X(0), oy = Y(0), sc = W2 / SPAN, gy = oy + H2 * .8, x0 = ox + 40 * sc, run = t * speed * .06 * sc;
    g.save(); rp(g, ox, oy, W2, H2, 6); g.clip();
    g.strokeStyle = C.grid; g.lineWidth = 1;
    for (const [fx, fy, k] of [[.2, .22, 1], [.62, .14, 2]]) { rp(g, ox + (((fx * W2 - t * .02 * k) % W2) + W2) % W2, oy + fy * H2, cs * 1.6, cs * .42, cs * .21); g.stroke(); }
    g.strokeStyle = C.ink; g.beginPath(); g.moveTo(ox, gy); g.lineTo(ox + W2, gy); g.stroke();
    g.fillStyle = C.ink3;
    for (let i = 0; i < 14; i++) g.fillRect(ox + (((i * 43 * sc - run) % W2) + W2) % W2, gy + 3 + (i % 3) * 3, i % 2 ? 3 : 1.5, 1.2);
    for (const ob of d.obstacles as { kind: string; distancePx: number; w: number; h: number; bottom: number }[]) {
      const x = x0 + ob.distancePx * sc, y = gy - (ob.bottom + ob.h) * sc;
      if (ob.kind.startsWith('bird')) bird(g, x, y, ob.w * sc, ob.h * sc, Math.floor(t / 140) % 2 === 0);
      else for (let k = 0; k < (ob.kind === 'group' ? 3 : 1); k++) pix(g, CACTUS, x + k * (ob.w / (ob.kind === 'group' ? 3 : 1)) * sc, y, (ob.w / (ob.kind === 'group' ? 3 : 1)) * sc / 6, ob.h * sc / 8, C.ink2);
    }
    const [bw, bh] = d.ducking ? DUCK : STAND, top = gy - d.dinoHeightPx * sc - bh * sc;
    pix(g, REX, x0, top, bw * sc / 18, bh * sc / 16, C.ink);
    const cx = x0 + 22 * sc;
    if (o.intent === 'jump') {
      const pts: Pt[] = [];
      for (let i = 0; i <= 16; i++) { const f = i / 16; pts.push([cx + f * 32 * speed * sc, top + bh * sc * .5 - Math.sin(f * Math.PI) * 80 * sc]); }
      intent(g, pts, t, C.blue, false);
    } else if (o.intent === 'duck') intent(g, [[cx, top - 26 * sc], [cx, top - 8 * sc]], t, C.blue);
    g.restore();
  },
};
