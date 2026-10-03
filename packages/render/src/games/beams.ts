import { block, C, cellAt, disc, dot, ring, screen, type G, type Pt, type Renderer } from '../frame.ts';

interface Src { color: string; at: Pt; direction: Pt }
interface Mir { at: Pt; shape: string }
const COLOR: Record<string, string> = { amber: C.amber, blue: C.blue };

function trace(s: Src, mirrors: Mir[], targets: Pt[]): { pts: Pt[]; end: Pt } {
  let [x, y] = s.at, [dx, dy] = s.direction;
  const pts: Pt[] = [[x, y]];
  for (let i = 0; i < 64; i++) {
    x += dx; y += dy;
    if (x < 0 || y < 0 || x > 5 || y > 5) { pts.push([x, y]); break; }
    if (targets.some((t) => t[0] === x && t[1] === y)) { pts.push([x, y]); break; }
    const m = mirrors.find((k) => k.at[0] === x && k.at[1] === y);
    if (m) { pts.push([x, y]); [dx, dy] = m.shape === '\\' ? [dy, dx] : [-dy, -dx]; }
  }
  return { pts, end: [x, y] };
}

export const beams: Renderer = {
  dims: [8, 8],
  draw(g: G, d, w, h, o) {
    const { cs, X, Y, P } = screen(g, w, h, 8, 8, [['beams', `${d.lit}/2`], ['moves', `${d.moves}/${d.budget}`], ['puzzle', `${d.puzzle}/3`]], { region: [1, 1, 6, 6] });
    const cell = (c: number, r: number) => P(c + 1, r + 1);
    const srcs: Src[] = d.sources, mirrors: Mir[] = d.mirrors, targets: { color: string; at: Pt }[] = d.targets, t = o.t ?? 0;
    const ends = srcs.map((s) => trace(s, mirrors, targets.map((k) => k.at)));
    ends.forEach(({ pts }, i) => {
      g.save(); g.strokeStyle = COLOR[srcs[i].color]; g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); pts.forEach(([x, y], j) => (j ? g.lineTo(...cell(x, y)) : g.moveTo(...cell(x, y)))); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.65)'; g.lineWidth = 1.2; g.setLineDash([3, 9]); g.lineDashOffset = -t / 25; g.stroke(); g.restore();
    });
    mirrors.forEach((m, k) => {
      const [x, y] = cell(...m.at), a = m.shape === '\\' ? Math.PI / 4 : -Math.PI / 4;
      g.strokeStyle = C.ink; g.lineWidth = 3.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - Math.cos(a) * cs * .38, y - Math.sin(a) * cs * .38); g.lineTo(x + Math.cos(a) * cs * .38, y + Math.sin(a) * cs * .38); g.stroke();
      dot(g, x, y, 1.6, '#fff');
      g.font = `500 ${Math.max(8, cs * .2)}px "Martian Mono",monospace`; g.fillStyle = C.ink3; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(String(k + 1), x - cs * .44, y - cs * .44);
    });
    srcs.forEach((s) => {
      const [x, y] = cell(...s.at);
      block(g, x - cs * .42, y - cs * .3, cs * .6, C.ink, { inset: 0, r: cs * .12 });
      g.fillStyle = COLOR[s.color]; g.fillRect(x - cs * .2, y - cs * .08, cs * .16, cs * .16);
    });
    targets.forEach((k, i) => {
      const [x, y] = cell(...k.at), lit = ends[i].end[0] === k.at[0] && ends[i].end[1] === k.at[1];
      g.strokeStyle = COLOR[k.color]; g.lineWidth = 2; g.beginPath(); g.arc(x, y, cs * .28, 0, 7); g.stroke();
      if (!lit) return;
      disc(g, x, y, cs * .15, COLOR[k.color]); g.lineWidth = 1.4;
      for (let j = 0; j < 4; j++) { const a = j * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.moveTo(x + Math.cos(a) * cs * .36, y + Math.sin(a) * cs * .36); g.lineTo(x + Math.cos(a) * cs * .46, y + Math.sin(a) * cs * .46); g.stroke(); }
    });
    const m = o.intent && /^flip([0-5])$/.exec(o.intent), k = m && mirrors[+m[1]];
    if (k) ring(g, X(k.at[0] + 1), Y(k.at[1] + 1), cs, C.blue);
  },
  hit(d, w, h, x, y) {
    const c = cellAt(w, h, 8, 8, x, y), k = c && (d.mirrors as Mir[]).findIndex((m) => m.at[0] === c[0] - 1 && m.at[1] === c[1] - 1);
    return k !== null && k >= 0 ? `flip${k}` : null;
  },
};
