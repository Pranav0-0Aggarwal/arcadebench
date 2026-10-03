import type { BoardRow } from '@arcadebench/api';
import { axis, tone } from '../components/board.ts';
import { f2 } from '../components/format.ts';
import { drawMark } from './mark.ts';

const UI = '"Hanken Grotesk"', NUM = '"Martian Mono"', ROW = 52, X0 = 420, X1 = 1080;

export async function standingsCard(rows: BoardRow[], title: string, foot: string): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  const c = document.createElement('canvas'), g = c.getContext('2d')!, top = rows.slice(0, 8), at = axis(top), X = (v: number) => X0 + (X1 - X0) * at(v);
  c.width = 1200;
  c.height = 630;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 1200, 630);
  drawMark(g, 60, 48, 8);
  g.fillStyle = '#151a22';
  g.font = `800 30px ${UI}`;
  g.fillText('ArcadeBench', 100, 74);
  g.fillStyle = '#525c6c';
  g.font = `22px ${NUM}`;
  g.fillText(title, 60, 112);
  g.font = `13px ${NUM}`;
  g.fillText('0 random', X(0), 148);
  g.textAlign = 'right';
  g.fillText('1.0 expert', X(1), 148);
  g.strokeStyle = '#e1e6ec';
  g.beginPath();
  [0, 1].forEach((v) => { g.moveTo(X(v), 160); g.lineTo(X(v), 160 + ROW * top.length); });
  g.stroke();
  top.forEach((r, i) => {
    const y = 160 + i * ROW + ROW / 2;
    g.textAlign = 'left';
    g.fillStyle = '#151a22';
    g.font = `700 22px ${UI}`;
    g.fillText(r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name, 60, y + 8);
    g.fillStyle = tone(r);
    g.globalAlpha = 0.25;
    g.fillRect(X(r.lo), y - 4, Math.max(2, X(r.hi) - X(r.lo)), 8);
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(X(r.iqm), y, 8, 0, 7);
    g.fill();
    g.fillStyle = '#151a22';
    g.font = `700 20px ${NUM}`;
    g.textAlign = 'right';
    g.fillText(f2(r.iqm), 1150, y + 7);
  });
  g.textAlign = 'left';
  g.fillStyle = '#525c6c';
  g.font = `15px ${NUM}`;
  g.fillText(foot, 60, 600);
  return c;
}
