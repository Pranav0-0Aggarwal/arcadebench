import { draw, ratio } from '@arcadebench/render';
import { stamp } from './mark.ts';

export interface Clip { game: string; data: unknown; title: string; who: string; score: number; meta: string; seedCode: string }

const W = 1200, H = 676, K = 1.5, UI = '"Hanken Grotesk"', NUM = '"Martian Mono"', X = 816, RW = 336;

export const fonts = () => Promise.all([`800 20px ${UI}`, `700 20px ${UI}`, `400 12px ${NUM}`, `500 12px ${NUM}`].map((f) => document.fonts.load(f)));
export const sheet = () => Object.assign(document.createElement('canvas'), { width: W, height: H });

function fitText(g: CanvasRenderingContext2D, s: string, font: (px: number) => string, px: number) {
  g.font = font(px);
  const w = g.measureText(s).width;
  g.font = font(w > RW ? Math.floor(px * RW / w) : px);
}

export function composite(g: CanvasRenderingContext2D, c: Clip) {
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#eef1f4';
  g.fillRect(0, 0, W, H);
  const r = ratio(c.game), bw = Math.min(720, 540 * r), bh = bw / r;
  g.save();
  g.translate(48 + (720 - bw) / 2, 40 + (540 - bh) / 2);
  g.scale(K, K);
  g.beginPath();
  g.rect(0, 0, bw / K, bh / K);
  g.clip();
  draw(g, c.game, c.data, bw / K, bh / K);
  g.restore();
  g.fillStyle = '#151a22';
  fitText(g, c.title, (p) => `800 ${p}px ${UI}`, 40);
  g.fillText(c.title, X, 100);
  g.fillStyle = '#525c6c';
  fitText(g, c.who, (p) => `700 ${p}px ${UI}`, 24);
  g.fillText(c.who, X, 140);
  g.font = `400 14px ${NUM}`;
  g.fillText('SCORE', X, 280);
  const score = String(+c.score.toFixed(2));
  g.fillStyle = '#151a22';
  fitText(g, score, (p) => `800 ${p}px ${UI}`, 120);
  g.fillText(score, X, 390);
  g.fillStyle = '#525c6c';
  g.font = `500 20px ${NUM}`;
  g.fillText(c.meta, X, 440);
  g.save();
  g.scale(K, K);
  stamp(g, W / K, H / K, '', `seed ${c.seedCode}`);
  g.restore();
}
