import { frame, screen, text, type G, type Pt } from './frame.ts';

const N = 300, UNIT = 40;

export function scene(g: G, w: number, h: number, [c, r]: Pt, d: any, body: () => void) {
  const f = screen(g, w, h, c, r, [['right', `${d.correct}/${d.answered}`], ['item', `${Math.min(d.answered + 1, N)}/${N}`]], { surface: false });
  g.save(); g.translate(f.X(0), f.Y(0)); g.scale(f.cs / UNIT, f.cs / UNIT);
  body();
  g.restore();
}

export function spot([c, r]: Pt, w: number, h: number, x: number, y: number): Pt {
  const f = frame(w, h, c, r);
  return [(x - f.X(0)) * UNIT / f.cs, (y - f.Y(0)) * UNIT / f.cs];
}

function wrap(g: G, s: string, w: number, max: number): string[] {
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
