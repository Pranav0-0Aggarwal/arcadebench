import { C, dot, MONO, rp, SANS, text, type G } from './frame.ts';

export const HAIR = '#cfd6df', GROUND = '#eef1f4', TINT = { good: '#dff2ee', bad: '#fde7e2' };

export function trunc(g: G, t: string, w: number) {
  if (g.measureText(t).width <= w) return t;
  let s = t;
  while (s.length > 3 && g.measureText(`${s}…`).width > w) s = s.slice(0, -1);
  return `${s}…`;
}

export function box(g: G, x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string) {
  rp(g, x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); }
}

export function card(g: G, x: number, y: number, w: number, h: number, note: string) {
  box(g, x, y, w, h, 12, '#fff', C.ink);
  text(g, note, x + 14, y + 24, `12px ${MONO}`, C.ink2);
}

export function bin(g: G, x: number, y: number, w: number, label: string, n: number, col: string, fill = '#fff') {
  box(g, x, y, w, 84, 10, fill, col);
  for (let j = 0; j < Math.min(n, 10); j++) {
    g.fillStyle = col;
    g.globalAlpha = .18 + .06 * j;
    g.fillRect(x + 8 + (j % 5) * ((w - 16) / 5), y + 50 - Math.floor(j / 5) * 16, (w - 16) / 5 - 4, 12);
  }
  g.globalAlpha = 1;
  text(g, `${label} ${n}`, x + w / 2, y + 24, `700 15px ${SANS}`, col, 'center');
}

export function chute(g: G, x: number, y0: number, y1: number, y2: number, dx: number) {
  g.strokeStyle = HAIR; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.lineTo(x - dx, y2); g.moveTo(x, y1); g.lineTo(x + dx, y2); g.stroke();
}

export function oops(g: G, x: number, y: number, n: number) {
  for (let j = 0; j < Math.min(n, 9); j++) {
    g.save();
    g.translate(x - 36 + (j % 5) * 18, y - Math.floor(j / 5) * 10);
    g.rotate(j % 2 ? -.18 : .14);
    g.fillStyle = C.red; g.globalAlpha = .85;
    g.fillRect(-8, -5, 16, 10);
    g.restore();
  }
  g.globalAlpha = 1;
  text(g, `oops ${n}`, x, y + 20, `12px ${MONO}`, C.ink2, 'center');
}

export function plug(g: G, x: number, y: number, w: number, h: number, ring: string) {
  box(g, x, y, w, h, Math.min(18, h / 2), '#fff', ring);
  dot(g, x + 14, y + h / 2, 5, HAIR);
}

export function wire(g: G, x0: number, y0: number, x1: number, y1: number, col: string) {
  const m = x0 + (x1 - x0) * .5;
  g.strokeStyle = col; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(m, y0, m, y1, x1, y1); g.stroke();
}

export const lamp = (g: G, x: number, y: number, f: number) => dot(g, x, y, 5 + f * 4, C.teal);

export function spark(g: G, x: number, y: number, f: number, k: number) {
  g.strokeStyle = C.red; g.lineWidth = 2;
  for (let a = 0; a < 6; a++) {
    const an = a * 1.05 + k, c = Math.cos(an), s = Math.sin(an);
    g.beginPath(); g.moveTo(x + c * 6, y + s * 6); g.lineTo(x + c * (8 + f * 12), y + s * (8 + f * 12)); g.stroke();
  }
}

export function belt(g: G, x: number, y: number, w: number, t: number) {
  g.fillStyle = GROUND; g.fillRect(x, y - 4, w, 8);
  g.fillStyle = HAIR;
  for (let p = x + ((t / 12) % 28); p < x + w; p += 28) g.fillRect(p, y - 4, 2, 8);
}

export function gate(g: G, x: number, y: number, shut: boolean, p = 1) {
  g.fillStyle = C.ink; g.fillRect(x - 12, y - 62, 24, 6);
  g.strokeStyle = shut ? C.red : HAIR; g.lineWidth = 4;
  g.beginPath(); g.moveTo(x, y - 56); g.lineTo(x, y - 56 + (shut ? p * 50 : 8)); g.stroke();
}

export function verdict(g: G, x: number, y: number, label: string, col: string, f = 1) {
  g.save(); g.translate(x, y); g.rotate(-.12);
  const s = 1.6 - .6 * f;
  g.scale(s, s); g.globalAlpha = f;
  g.font = `800 16px ${SANS}`;
  const tw = g.measureText(label).width;
  g.strokeStyle = col; g.lineWidth = 2.5; g.strokeRect(-tw / 2 - 8, -14, tw + 16, 26);
  text(g, label, 0, 5, `800 16px ${SANS}`, col, 'center');
  g.restore();
}
