import { draw, ratio, stats } from '@arcadebench/render';
import { drawLogo } from './logo.ts';

export type Frame = Clip | Grid;
export interface Grid { title: string; sub: string; cells: Clip[] }
export interface Clip { game: string; data: unknown; title: string; who: string; score: number; seedCode: string; at: number; total: number; final?: boolean }

const W = 1200, H = 676, UI = '"Hanken Grotesk"', NUM = '"Martian Mono"', X = 740, RW = 420, INK = '#151a22', MUTED = '#525c6c', BG = '#eef1f4';

const layer = document.createElement('canvas');

export const fonts = () => Promise.all([`800 20px ${UI}`, `700 20px ${UI}`, `400 12px ${NUM}`, `500 12px ${NUM}`].map((f) => document.fonts.load(f)));
export const sheet = (s = 1) => Object.assign(document.createElement('canvas'), { width: Math.round(W * s / 2) * 2, height: Math.round(H * s / 2) * 2 });

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, weight: number, font: string, color: string, max = RW) {
  g.font = `${weight} ${px}px ${font}`;
  const w = g.measureText(s).width;
  if (w > max) g.font = `${weight} ${Math.floor(px * max / w)}px ${font}`;
  g.fillStyle = color;
  g.fillText(s, x, y);
}

function board(g: CanvasRenderingContext2D, c: Clip, x: number, y: number, w: number, h: number, k: number) {
  const r = ratio(c.game), bw = Math.round(Math.min(w, h * r)), bh = Math.round(bw / r), s = g.getTransform().a;
  layer.width = Math.round(bw * s);
  layer.height = Math.round(bh * s);
  const lg = layer.getContext('2d')!;
  lg.setTransform(k * s, 0, 0, k * s, 0, 0);
  draw(lg, c.game, c.data, bw / k, bh / k);
  g.drawImage(layer, x + (w - bw) / 2, y + (h - bh) / 2, bw, bh);
}

function brand(g: CanvasRenderingContext2D, s: number) {
  g.font = `800 ${32 * s}px ${UI}`;
  const name = 'ArcadeBench', nw = g.measureText(name).width;
  g.font = `400 ${17 * s}px ${NUM}`;
  const url = 'penguinzz.com/arcadebench', uw = g.measureText(url).width, x0 = W - (36 + 90 + 18) * s - nw - uw, y = H - 12 - 76 * s;
  drawLogo(g, x0, y, 76 * s);
  text(g, name, x0 + 90 * s, y + 62 * s, 32 * s, 800, UI, INK, 400 * s);
  text(g, url, x0 + 90 * s + nw + 18 * s, y + 61 * s, 17 * s, 400, NUM, MUTED, 400 * s);
}

function single(g: CanvasRenderingContext2D, c: Clip) {
  board(g, c, 40, 32, 640, 556, 1.4);
  const s = stats(c.game, c.data, c.score);
  text(g, c.title, X, 92, 40, 800, UI, INK);
  text(g, c.who, X, 128, 22, 700, UI, MUTED);
  text(g, s.head[0].toUpperCase(), X, 214, 15, 500, NUM, MUTED);
  text(g, s.head[1], X, 318, 108, 800, UI, INK);
  s.rows.slice(0, 2).forEach(([k2, v], i) => {
    text(g, k2.toUpperCase(), X + i * 220, 372, 13, 500, NUM, MUTED, 200);
    text(g, v, X + i * 220, 408, 30, 700, UI, INK, 200);
  });
  const p = c.total ? c.at / c.total : 1;
  g.fillStyle = '#dde2e8';
  g.beginPath(); g.roundRect(X, 456, RW, 6, 3); g.fill();
  g.fillStyle = INK;
  g.beginPath(); g.roundRect(X, 456, Math.max(6, RW * p), 6, 3); g.fill();
  text(g, `move ${c.at} of ${c.total}`, X, 492, 16, 500, NUM, MUTED);
  const badge = c.final ? s.badge ?? 'Final' : s.badge;
  if (badge) {
    g.font = `800 20px ${UI}`;
    const bw2 = g.measureText(badge).width + 32;
    g.fillStyle = '#4654e6';
    g.beginPath(); g.roundRect(X, 520, bw2, 40, 20); g.fill();
    g.fillStyle = '#fff';
    g.fillText(badge, X + 16, 547);
  }
  if (c.seedCode) text(g, `seed ${c.seedCode}`, 40, 646, 16, 400, NUM, MUTED);
  brand(g, 1);
}

const PAD = 24, GAP = 16, HEAD = 76, BAND = 603, SIDE = 210, STRIP = 64;

function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, p: number) {
  g.fillStyle = '#dde2e8';
  g.beginPath(); g.roundRect(x, y, w, 4, 2); g.fill();
  g.fillStyle = INK;
  g.beginPath(); g.roundRect(x, y, Math.max(4, w * p), 4, 2); g.fill();
}

function tile(g: CanvasRenderingContext2D, c: Clip, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#fff';
  g.beginPath(); g.roundRect(x, y, w, h, 14); g.fill();
  const r = ratio(c.game), fit = (a: number, b: number) => Math.min(a, b * r), side = fit(w - 44 - SIDE, h - 28) > fit(w - 28, h - 36 - STRIP);
  const bx = x + 14, by = y + 14, bw = side ? w - 44 - SIDE : w - 28, bh = side ? h - 28 : h - 36 - STRIP;
  board(g, c, bx, by, bw, bh, 1.2);
  const s = stats(c.game, c.data, c.score), badge = c.final ? s.badge ?? 'Final' : s.badge, p = c.total ? c.at / c.total : 1;
  if (!side) {
    const ty = by + bh + 8, hx = bx + bw * 0.62, hw = bw * 0.38;
    text(g, c.who, bx, ty + 22, 20, 800, UI, INK, bw * 0.58);
    text(g, c.title, bx, ty + 44, 14, 700, UI, MUTED, bw * 0.58);
    text(g, `${s.head[0].toUpperCase()}${badge ? ` · ${badge}` : ''}`, hx, ty + 14, 11, 500, NUM, MUTED, hw);
    text(g, s.head[1], hx, ty + 46, 30, 800, UI, INK, hw);
    return bar(g, bx, ty + 58, bw, p);
  }
  const tx = bx + bw + 16, ty = by, tw = x + w - 14 - tx;
  g.font = `800 15px ${UI}`;
  const pw = badge ? g.measureText(badge).width + 24 : 0;
  text(g, c.who, tx, ty + 24, 26, 800, UI, INK, tw);
  text(g, c.title, tx, ty + 48, 20, 700, UI, INK, tw);
  text(g, s.head[0].toUpperCase(), tx, ty + 80, 12, 500, NUM, MUTED, tw);
  text(g, s.head[1], tx, ty + 128, 52, 800, UI, INK, tw - pw - 12);
  if (badge) {
    g.fillStyle = '#4654e6';
    g.beginPath(); g.roundRect(tx + tw - pw, ty + 100, pw, 26, 13); g.fill();
    g.fillStyle = '#fff';
    g.font = `800 15px ${UI}`;
    g.fillText(badge, tx + tw - pw + 12, ty + 119);
  }
  s.rows.slice(0, 2).forEach(([k, v], i) => {
    text(g, k.toUpperCase(), tx + i * tw / 2, ty + 154, 11, 500, NUM, MUTED, tw / 2 - 8);
    text(g, v, tx + i * tw / 2, ty + 178, 22, 700, UI, INK, tw / 2 - 8);
  });
  bar(g, tx, ty + 192, tw, p);
  text(g, `move ${c.at} of ${c.total}`, tx, ty + 214, 13, 500, NUM, MUTED, tw);
}

function cells(g: CanvasRenderingContext2D, d: Grid) {
  const rows = Math.ceil(d.cells.length / 2), w = (W - 2 * PAD - GAP) / 2, h = (BAND - 8 - HEAD - (rows - 1) * GAP) / rows;
  text(g, d.title, PAD, 42, 30, 800, UI, INK, W - 2 * PAD);
  text(g, d.sub, PAD, 64, 14, 500, NUM, MUTED, W - 2 * PAD);
  d.cells.forEach((c, i) => tile(g, c, PAD + (i % 2) * (w + GAP), HEAD + Math.floor(i / 2) * (h + GAP), w, h));
  brand(g, 0.7);
}

export function composite(g: CanvasRenderingContext2D, c: Frame) {
  g.setTransform(g.canvas.width / W, 0, 0, g.canvas.height / H, 0, 0);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  if ('cells' in c) cells(g, c); else single(g, c);
}
