import { block, C, ghost, MONO, screen, text, type G, type Pt, type Renderer } from '../frame.ts';

type Cells = Pt[];
const COLOR: Record<string, string> = { I: C.blue, O: C.amber, T: C.purple, S: C.teal, Z: C.red, J: C.ink, L: C.ink2 };
const BASE: Record<string, Cells> = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]], O: [[0, 0], [1, 0], [0, 1], [1, 1]], T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
const norm = (c: Cells): Cells => {
  const mx = Math.min(...c.map((p) => p[0])), my = Math.min(...c.map((p) => p[1]));
  return c.map(([x, y]) => [x - mx, y - my] as Pt).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
const ROT = Object.fromEntries(Object.keys(BASE).map((k) => {
  const seen = new Set<string>(), out: Cells[] = [];
  let r = BASE[k];
  for (let i = 0; i < 4; i++) {
    const n = norm(r), key = JSON.stringify(n);
    if (!seen.has(key)) { seen.add(key); out.push(n); }
    r = r.map(([x, y]) => [-y, x] as Pt);
  }
  return [k, out];
}));

const landing = (rows: string[], c: Cells, x: number) => {
  const free = (y: number) => c.every(([cx, cy]) => rows[y + cy]?.[x + cx] === '.');
  if (!free(0)) return -1;
  let y = 0;
  while (free(y + 1)) y++;
  return y;
};

function mini(g: G, label: string, kind: string, x: number, y: number, cs: number) {
  text(g, label, x, y + 9, `400 10.5px ${MONO}`, C.ink2);
  for (const [cx, cy] of ROT[kind][0]) block(g, x + cx * cs * .55, y + 16 + cy * cs * .55, cs * .55, COLOR[kind]);
}

export const tetris: Renderer = {
  dims: [14, 20],
  draw(g, d, w, h, o) {
    const { cs, X, Y } = screen(g, w, h, 14, 20, [['lines', String(d.lines)], ['pieces', `${d.pieces}/500`]], { region: [0, 0, 10, 20] });
    d.board.forEach((row: string, y: number) => [...row].forEach((ch, x) => { if (ch !== '.') block(g, X(x), Y(y), cs, COLOR[ch]); }));
    const m = o.intent && /^r(\d+)c(\d+)$/.exec(o.intent), c = m && ROT[d.piece]?.[+m[1]];
    if (m && c) {
      const x = +m[2], y = landing(d.board, c, x);
      if (y >= 0) {
        for (const [cx, cy] of c) ghost(g, X(x + cx), Y(y + cy), cs, C.purple);
        for (const [cx, cy] of c) block(g, X(x + cx), Y(cy), cs, COLOR[d.piece]);
      }
    }
    mini(g, 'now', d.piece, X(10.7), Y(0), cs);
    mini(g, 'next', d.next, X(10.7), Y(3.6), cs);
  },
};
