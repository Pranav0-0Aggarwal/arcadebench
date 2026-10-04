import { C, fresh, intent, MONO, rp, SANS, screen, text, type G, type Pt, type Renderer } from './frame.ts';

export const N = 300;
export const TINT = { good: '#dff2ee', bad: '#fde7e2' };
export const face = (cs: number, k: number, weight = 400, family = SANS) => `${weight} ${Math.max(5, cs * k)}px ${family}`;

export function paper(g: G, x: number, y: number, w: number, h: number, r: number, stroke = C.ink, fill = '#fff') {
  g.fillStyle = fill; rp(g, x, y, w, h, r); g.fill(); g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke();
}

export function wrap(g: G, s: string, w: number, max: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of s.replace(/\s+/g, ' ').trim()) {
    if (cur && g.measureText(cur + ch).width > w) {
      const sp = cur.lastIndexOf(' ');
      if (ch !== ' ' && sp > 0) { lines.push(cur.slice(0, sp)); cur = cur.slice(sp + 1) + ch; } else { lines.push(cur.trimEnd()); cur = ch === ' ' ? '' : ch; }
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  if (lines.length > max) {
    lines.length = max;
    let last = lines[max - 1];
    while (last.length > 1 && g.measureText(`${last}…`).width > w) last = last.slice(0, -1);
    lines[max - 1] = `${last}…`;
  }
  return lines;
}

export function paragraph(g: G, s: string, x: number, y: number, w: number, lh: number, max: number, font: string, fill: string) {
  g.font = font;
  wrap(g, s, w, max).forEach((l, i) => text(g, l, x, y + i * lh, font, fill, 'left', 'top'));
}

export function clip(g: G, s: string, w: number, font: string) {
  g.font = font;
  while (s.length > 1 && g.measureText(s).width > w) s = `${s.slice(0, -2)}…`;
  return s;
}

export function stamp(g: G, x: number, y: number, label: string, col: string, cs: number) {
  g.save(); g.translate(x, y); g.rotate(-0.12);
  g.font = face(cs, .4, 800);
  const tw = g.measureText(label).width;
  g.fillStyle = '#fff'; rp(g, -tw / 2 - cs * .2, -cs * .36, tw + cs * .4, cs * .72, cs * .1); g.fill();
  g.strokeStyle = col; g.lineWidth = 2.5; g.stroke();
  text(g, label, 0, 0, face(cs, .4, 800), col, 'center', 'middle');
  g.restore();
}

export const card = (g: G, x: number, y: number, w: number, h: number, cs: number, note: string) => {
  paper(g, x, y, w, h, cs * .28);
  text(g, note, x + cs * .3, y + cs * .28, face(cs, .26, 400, MONO), C.ink2, 'left', 'top');
};

interface Two {
  note: string;
  gate?: boolean;
  bins: [id: string, label: string, color: string][];
  hud(d: any): [string, string][];
  count(d: any, id: string): number;
  body(g: G, d: any, x: number, y: number, w: number, cs: number): void;
  say(pick: string, right: boolean): [string, string];
}

export function two(c: Two): Renderer {
  return {
    dims: [8, 10],
    draw(g, d, w, h, o) {
      const { cs, X, Y } = screen(g, w, h, 8, 10, c.hud(d), { surface: false }), cx = (k: number) => X(k ? 6 : 2), top = Y(6.8), flash = d.last && fresh(o, 1500);
      card(g, X(.4), Y(.3), 7.2 * cs, 3.7 * cs, cs, c.note);
      if (d.item) c.body(g, d.item, X(.7), Y(.3) + cs * .75, 6.6 * cs, cs);
      else text(g, `finished: ${d.correct} of ${d.answered} right`, X(4), Y(2.1), face(cs, .42, 700), C.ink, 'center', 'middle');
      g.strokeStyle = C.dot; g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(X(4), Y(4)); g.lineTo(X(4), Y(5.2)); g.lineTo(cx(0), top); g.moveTo(X(4), Y(5.2)); g.lineTo(cx(1), top); g.stroke();
      const k = c.bins.findIndex((b) => b[0] === o.intent), path: Pt[] = [[X(4), Y(4)], [X(4), Y(5.2)], [cx(k), top - cs * .28]];
      if (k >= 0) intent(g, path, o.t ?? 0, C.blue);
      c.bins.forEach(([id, label, col], j) => {
        const bx = X(j ? 4.4 : .4), n = c.count(d, id), hit = flash && d.last.pick === id;
        paper(g, bx, top + cs * .2, 3.2 * cs, 2.6 * cs, cs * .25, col, hit ? (d.last.right ? TINT.good : TINT.bad) : '#fff');
        text(g, `${label} ${n}`, cx(j), top + cs * .75, face(cs, .38, 700), col, 'center', 'middle');
        for (let i = 0; i < Math.min(n, 10); i++) { g.globalAlpha = .18 + .06 * i; g.fillStyle = col; g.fillRect(bx + cs * .25 + (i % 5) * cs * .56, top + cs * 1.7 - Math.floor(i / 5) * cs * .4, cs * .46, cs * .3); }
        g.globalAlpha = 1;
        if (c.gate) {
          const [a, len] = j ? [0, 3.2] : [-1.45, 1.4], py = top + cs * .2;
          g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); g.moveTo(bx, py); g.lineTo(bx + Math.cos(a) * cs * len, py + Math.sin(a) * cs * len); g.stroke();
        }
      });
      if (flash) stamp(g, cx(c.bins.findIndex((b) => b[0] === d.last.pick)), top - cs * .62, ...c.say(d.last.pick, d.last.right), cs);
    },
    hit: (_d, w, _h, x, y) => (y < 22 ? null : c.bins[x < w / 2 ? 0 : 1][0]),
  };
}
