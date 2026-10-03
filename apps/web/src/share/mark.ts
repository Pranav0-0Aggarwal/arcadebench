const CELLS: [number, number][] = [[0, 2], [1, 2], [1, 1], [2, 2], [2, 1], [2, 0]];
const UI = '"Hanken Grotesk"', NUM = '"Martian Mono"';

export function drawMark(g: CanvasRenderingContext2D, x: number, y: number, u: number) {
  CELLS.forEach(([cx, cy], i) => {
    g.fillStyle = i === 5 ? '#4654e6' : '#151a22';
    g.beginPath();
    g.roundRect(x + cx * u * 1.25, y + cy * u * 1.25, u, u, u * 0.27);
    g.fill();
  });
}

export function stamp(g: CanvasRenderingContext2D, w: number, h: number, dataset: string, note = '') {
  g.save();
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const u = 4, mw = u * 3.5, url = `penguinzz.com/arcadebench · ${dataset}`;
  g.font = `12px ${NUM}`;
  const uw = g.measureText(url).width;
  g.font = `800 13px ${UI}`;
  const nw = g.measureText('ArcadeBench').width, full = mw + 7 + nw + 10 + uw, x = w - 14 - full;
  const left = x > 10 ? x : w - 14 - (mw + 7 + nw);
  drawMark(g, left, h - 12 - u * 3.25, u);
  g.fillStyle = '#151a22';
  g.fillText('ArcadeBench', left + mw + 7, h - 12);
  if (x > 10) { g.font = `12px ${NUM}`; g.fillStyle = '#525c6c'; g.fillText(url, left + mw + 7 + nw + 10, h - 12); }
  if (note) { g.font = `12px ${NUM}`; g.fillStyle = '#525c6c'; g.fillText(note, 14, h - 12); }
  g.restore();
}
