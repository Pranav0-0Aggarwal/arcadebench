import { draw, ratio, stats } from '@arcadebench/render';
import { drawLogo } from './logo.ts';

export interface Clip { game: string; data: unknown; title: string; who: string; score: number; seedCode: string; at: number; total: number; final?: boolean }

const W = 1200, H = 676, UI = '"Hanken Grotesk"', NUM = '"Martian Mono"', X = 740, RW = 420, INK = '#151a22', MUTED = '#525c6c', BG = '#eef1f4';

export const fonts = () => Promise.all([`800 20px ${UI}`, `700 20px ${UI}`, `400 12px ${NUM}`, `500 12px ${NUM}`].map((f) => document.fonts.load(f)));
export const sheet = () => Object.assign(document.createElement('canvas'), { width: W, height: H });

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, weight: number, font: string, color: string, max = RW) {
  g.font = `${weight} ${px}px ${font}`;
  const w = g.measureText(s).width;
  if (w > max) g.font = `${weight} ${Math.floor(px * max / w)}px ${font}`;
  g.fillStyle = color;
  g.fillText(s, x, y);
}

export function composite(g: CanvasRenderingContext2D, c: Clip) {
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  const r = ratio(c.game), bw = Math.min(640, 556 * r), bh = bw / r, k = 1.4;
  g.save();
  g.translate(40 + (640 - bw) / 2, 32 + (556 - bh) / 2);
  g.scale(k, k);
  draw(g, c.game, c.data, bw / k, bh / k);
  g.restore();
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
  text(g, `seed ${c.seedCode}`, 40, 646, 16, 400, NUM, MUTED);
  g.font = `800 28px ${UI}`;
  const name = 'ArcadeBench', nw = g.measureText(name).width;
  g.font = `400 16px ${NUM}`;
  const url = 'penguinzz.com/arcadebench', uw = g.measureText(url).width, x0 = W - 40 - 52 - 12 - nw - 16 - uw;
  drawLogo(g, x0, 604, 52);
  text(g, name, x0 + 64, 648, 28, 800, UI, INK, 400);
  text(g, url, x0 + 64 + nw + 16, 647, 16, 400, NUM, MUTED, 400);
}
