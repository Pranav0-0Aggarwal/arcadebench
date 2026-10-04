export type G = CanvasRenderingContext2D;
export type Pt = [number, number];
export interface Opts { t?: number; intent?: string; age?: number; marks?: string[] }
export const fresh = (o: Opts, ms: number) => o.age === undefined || o.age < ms;
export interface Renderer {
  dims: Pt;
  draw(g: G, d: any, w: number, h: number, o: Opts): void;
  hit?(d: any, w: number, h: number, x: number, y: number): string | null;
}
export interface Frame { cs: number; X(c: number): number; Y(r: number): number; P(c: number, r: number): Pt }

export const C = {
  ink: '#151a22', ink2: '#525c6c', ink3: '#8a93a3', grid: '#e1e6ec', dot: '#c9d1db', paper: '#f6f8fa', stone: '#d6dce4', cover: '#e4e9ef',
  blue: '#4654e6', teal: '#0f8f80', red: '#d9502f', amber: '#c98a00', purple: '#a443bd',
};
export const MONO = '"Martian Mono",monospace', SANS = '"Hanken Grotesk",system-ui,sans-serif';
export const DIR: Record<string, Pt> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const TOP = 22, INSET = 10;
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const rp = (g: G, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, Math.max(0, r)); };
export const dot = (g: G, x: number, y: number, r: number, fill: string) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, Math.max(0, r), 0, 7); g.fill(); };
export function text(g: G, s: string, x: number, y: number, font: string, fill: string, align: CanvasTextAlign = 'left', base: CanvasTextBaseline = 'alphabetic') {
  g.font = font; g.fillStyle = fill; g.textAlign = align; g.textBaseline = base; g.fillText(s, x, y);
}

export function frame(w: number, h: number, cols: number, rows: number): Frame {
  const vh = h - TOP, cs = Math.max(1, Math.min((w - 2 * INSET) / cols, (vh - 2 * INSET) / rows)), ox = (w - cs * cols) / 2, oy = TOP + (vh - cs * rows) / 2;
  return { cs, X: (c) => ox + c * cs, Y: (r) => oy + r * cs, P: (c, r) => [ox + (c + .5) * cs, oy + (r + .5) * cs] };
}
export function cellAt(w: number, h: number, cols: number, rows: number, x: number, y: number): Pt | null {
  const f = frame(w, h, cols, rows), c = Math.floor((x - f.X(0)) / f.cs), r = Math.floor((y - f.Y(0)) / f.cs);
  return c >= 0 && r >= 0 && c < cols && r < rows ? [c, r] : null;
}

export function screen(g: G, w: number, h: number, cols: number, rows: number, hud: [string, string][], o: { region?: [number, number, number, number]; surface?: boolean; dots?: boolean } = {}): Frame {
  g.clearRect(0, 0, w, h);
  const f = frame(w, h, cols, rows), { cs } = f;
  g.fillStyle = C.paper; rp(g, .5, TOP + .5, w - 1, h - TOP - 1, 10); g.fill(); g.strokeStyle = C.grid; g.lineWidth = 1; g.stroke();
  if (o.surface !== false) {
    const [rx, ry, rc, rh] = o.region ?? [0, 0, cols, rows], x = f.X(rx), y = f.Y(ry);
    g.fillStyle = '#fff'; rp(g, x, y, rc * cs, rh * cs, 6); g.fill(); g.stroke();
    if (o.dots !== false) { g.fillStyle = C.dot; for (let i = 1; i < rc; i++) for (let j = 1; j < rh; j++) g.fillRect(Math.round(x + i * cs) - .75, Math.round(y + j * cs) - .75, 1.5, 1.5); }
  }
  let x = 1;
  for (const [k, v] of hud) {
    g.font = `400 11.5px ${MONO}`;
    const kw = g.measureText(k).width + 6;
    g.font = `500 11.5px ${MONO}`;
    const vw = g.measureText(v).width;
    if (x + kw + vw > w) break;
    text(g, k, x, 13, `400 11.5px ${MONO}`, C.ink2);
    text(g, v, x + kw, 13, `500 11.5px ${MONO}`, C.ink);
    x += kw + vw + 14;
  }
  return f;
}

export function block(g: G, x: number, y: number, s: number, fill: string, o: { inset?: number; r?: number; flat?: boolean } = {}) {
  const i = o.inset ?? Math.max(1.2, s * .07), r = o.r ?? s * .2, X = x + i, Y = y + i, S = Math.max(0, s - 2 * i);
  g.fillStyle = fill; rp(g, X, Y, S, S, r); g.fill();
  if (o.flat) return;
  const b = Math.max(1, S * .1);
  g.save(); rp(g, X, Y, S, S, r); g.clip(); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(X, Y, S, b); g.fillStyle = 'rgba(16,20,28,.14)'; g.fillRect(X, Y + S - b, S, b); g.restore();
}
export function ghost(g: G, x: number, y: number, s: number, col: string) {
  const i = Math.max(1.2, s * .07);
  g.save(); g.strokeStyle = col; g.lineWidth = 1.25; g.setLineDash([3, 2.5]); rp(g, x + i + .5, y + i + .5, s - 2 * i - 1, s - 2 * i - 1, s * .2); g.stroke(); g.restore();
}
export function disc(g: G, x: number, y: number, r: number, fill: string) {
  dot(g, x, y, r, fill);
  g.save(); g.beginPath(); g.arc(x, y, Math.max(0, r), 0, 7); g.clip();
  g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(x - r, y - r, 2 * r, r * .35); g.fillStyle = 'rgba(16,20,28,.14)'; g.fillRect(x - r, y + r * .68, 2 * r, r * .4); g.restore();
}
export function ring(g: G, x: number, y: number, s: number, col: string) {
  g.save(); g.strokeStyle = col; g.lineWidth = 1.8; rp(g, x + 1.5, y + 1.5, s - 3, s - 3, s * .16); g.stroke(); g.restore();
}
export function intent(g: G, pts: Pt[], t: number, col = C.ink2, head = true) {
  if (pts.length < 2) return;
  g.save(); g.strokeStyle = col; g.fillStyle = col; g.globalAlpha = .7; g.lineWidth = 1.5; g.setLineDash([4, 4]); g.lineDashOffset = -t / 45; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.setLineDash([]);
  if (head) { const [a, b] = pts.slice(-2), ang = Math.atan2(b[1] - a[1], b[0] - a[0]); g.translate(b[0], b[1]); g.rotate(ang); g.beginPath(); g.moveTo(4, 0); g.lineTo(-3, 3.5); g.lineTo(-3, -3.5); g.closePath(); g.fill(); }
  g.restore();
}
export function pix(g: G, map: string[], x: number, y: number, sx: number, sy: number, fill: string) {
  g.fillStyle = fill;
  map.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') g.fillRect(Math.round(x + i * sx), Math.round(y + j * sy), Math.ceil(sx), Math.ceil(sy)); }));
}
