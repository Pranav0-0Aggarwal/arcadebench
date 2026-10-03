const INK = '#151a22', BLUE = '#4654e6', BEAK = '#f29d38', WHITE = '#fff';
const rr = (x: number, y: number, s: number, r: number) => `M${x + r} ${y}h${s - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${s - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${2 * r - s}a${r} ${r} 0 0 1 ${-r} ${-r}v${2 * r - s}a${r} ${r} 0 0 1 ${r} ${-r}z`;
const oval = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;

type Part = [string, string];
const BLOCKS: Part[] = [[1.5, 16.5], [9, 16.5], [9, 9], [16.5, 16.5], [16.5, 9], [16.5, 1.5]].map(([x, y], i) => [rr(x, y, 6, 1.6), i === 5 ? BLUE : INK]);
const PENGUIN: Part[] = [
  [oval(-0.9, 0, 0.95, 0.38), BEAK], [oval(0.9, 0, 0.95, 0.38), BEAK],
  ['M1.4 -2.4q1.9 -0.7 3 -2.1q-0.4 1.5 -2.7 3z', INK],
  [oval(0, -3.3, 2.2, 3.2), INK], [oval(0.5, -2.8, 1.3, 2.2), WHITE],
  [oval(0.95, -5, 0.52, 0.52), WHITE], [oval(1.1, -5, 0.25, 0.25), INK],
  ['M1.9 -5.1L3.5 -4.7L1.9 -4.3z', BEAK],
];
const AT = { x: 12.3, y: 8.85, deg: 12 };

export function drawLogo(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  g.save();
  g.translate(x, y);
  g.scale(size / 24, size / 24);
  for (const [d, c] of BLOCKS) { g.fillStyle = c; g.fill(new Path2D(d)); }
  g.translate(AT.x, AT.y);
  g.rotate(AT.deg * Math.PI / 180);
  for (const [d, c] of PENGUIN) { g.fillStyle = c; g.fill(new Path2D(d)); }
  g.restore();
}

export const logoSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="ArcadeBench">${BLOCKS.map(([d, c]) => `<path d="${d}" fill="${c}"/>`).join('')}<g transform="translate(${AT.x} ${AT.y}) rotate(${AT.deg})">${PENGUIN.map(([d, c]) => `<path d="${d}" fill="${c}"/>`).join('')}</g></svg>\n`;
