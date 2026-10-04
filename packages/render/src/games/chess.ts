import { C, dot, frame, intent, MONO, ring, rp, SANS, screen, text, type G, type Pt, type Renderer } from '../frame.ts';

const BASE = 'M 24 90 L 76 90 L 76 83 Q 76 78 70 78 L 30 78 Q 24 78 24 83 Z';
const ART: { body: string[]; line: string[] }[] = [
  { body: ['O 50 30 12', 'M 41 44 L 59 44 Q 58 57 64 67 L 68 78 L 32 78 L 36 67 Q 42 57 41 44 Z', BASE], line: [] },
  { body: ['M 70 80 L 30 80 Q 28 62 38 50 Q 43 45 40 40 L 31 45 Q 25 46 25 40 L 30 31 Q 38 20 54 18 L 59 12 L 61 21 Q 77 28 77 54 Q 77 68 73 80 Z', BASE], line: ['M 33 78 L 69 78', 'O 46 31 2'] },
  { body: ['O 50 14 5', 'M 50 20 Q 68 34 62 52 Q 60 59 56 62 L 65 70 L 61 78 L 39 78 L 35 70 L 44 62 Q 40 59 38 52 Q 32 34 50 20 Z', BASE], line: ['M 44 40 L 56 40', 'M 50 34 L 50 46'] },
  { body: ['M 29 18 L 40 18 L 40 26 L 45 26 L 45 18 L 55 18 L 55 26 L 60 26 L 60 18 L 71 18 L 71 36 L 29 36 Z', 'M 34 38 L 66 38 L 63 66 L 70 76 L 30 76 L 37 66 Z', BASE], line: ['M 30 36 L 70 36', 'M 36 66 L 64 66'] },
  { body: ['O 24 30 4.5', 'O 37 25 4.5', 'O 50 22 4.5', 'O 63 25 4.5', 'O 76 30 4.5', 'M 24 36 L 34 64 L 36 34 L 44 62 L 50 30 L 56 62 L 64 34 L 66 64 L 76 36 L 72 76 L 28 76 Z', BASE], line: ['M 30 70 L 70 70'] },
  { body: ['M 47 8 L 53 8 L 53 14 L 59 14 L 59 20 L 53 20 L 53 26 L 47 26 L 47 20 L 41 20 L 41 14 L 47 14 Z', 'M 50 30 Q 36 28 31 40 Q 28 50 36 58 L 30 76 L 70 76 L 64 58 Q 72 50 69 40 Q 64 28 50 30 Z', BASE], line: ['M 33 68 L 67 68', 'M 50 30 L 50 40'] },
];
const OPS = { M: 'moveTo', L: 'lineTo', C: 'bezierCurveTo', Q: 'quadraticCurveTo' } as const;
const LIGHT = '#f2f5f9', DARK = '#c3ccd8', PAWNS = [0, 1, 3, 3, 5, 9, 0];

function trace(g: G, d: string, x: number, y: number, k: number) {
  const t = d.split(' '), at = (i: number) => [x + +t[i] * k, y + +t[i + 1] * k];
  g.beginPath();
  for (let i = 0; i < t.length;) {
    const c = t[i++];
    if (c === 'Z') g.closePath();
    else if (c === 'O') { const [px, py] = at(i), r = +t[i + 2] * k; g.moveTo(px + r, py); g.arc(px, py, r, 0, 7); i += 3; }
    else { const n = c === 'C' ? 3 : c === 'Q' ? 2 : 1; (g[OPS[c as keyof typeof OPS]] as (...a: number[]) => void).apply(g, Array.from({ length: n }, (_, j) => at(i + 2 * j)).flat()); i += 2 * n; }
  }
}
function piece(g: G, ch: string, cx: number, cy: number, s: number, alpha = 1) {
  const black = ch === ch.toLowerCase(), art = ART['pnbrqk'.indexOf(ch.toLowerCase())], x = cx - s / 2, y = cy - s / 2, k = s / 100;
  g.save(); g.globalAlpha = alpha; g.lineJoin = 'round'; g.lineCap = 'round';
  g.fillStyle = black ? C.ink : '#fff'; g.strokeStyle = C.ink; g.lineWidth = Math.max(1, s * .035);
  for (const d of art.body) { trace(g, d, x, y, k); g.fill(); g.stroke(); }
  g.strokeStyle = black ? 'rgba(255,255,255,.6)' : 'rgba(21,26,34,.55)'; g.lineWidth = Math.max(.8, s * .025);
  for (const d of art.line) { trace(g, d, x, y, k); if (d.startsWith('O')) { g.fillStyle = g.strokeStyle; g.fill(); } else g.stroke(); }
  g.restore();
}

const sq = (name: string) => [name.charCodeAt(0) - 97, name.charCodeAt(1) - 49] as Pt;
const val = (c: string) => PAWNS['pnbrqk'.indexOf(c.toLowerCase()) + 1];
const tally = (s: string) => [...s].reduce((t, c) => t + val(c), 0);

function geo(d: any, w: number, h: number) {
  const f = frame(w, h, 8, 9), flip = d.you === 'b';
  return { ...f, flip, at: (name: string): Pt => { const [c, r] = sq(name); return [f.X(flip ? 7 - c : c), f.Y(.5 + (flip ? r : 7 - r))]; } };
}

export const chess: Renderer = {
  dims: [8, 9],
  draw(g, d, w, h, o) {
    const over = !!d.say, name = d.turn === 'w' ? 'White' : 'Black', marks = o.marks ?? [];
    const { cs, flip, at, X, Y } = geo(d, w, h);
    screen(g, w, h, 8, 9, [[over ? 'result' : 'to move', over ? d.why : name], ...(d.acc != null ? [['accuracy', `${Math.round(d.acc)}%`] as [string, string]] : []), ['move', String(d.moves ?? '')]], { surface: false });
    const bx = X(0), by = Y(.5), sel = marks.find((m) => m.startsWith('sel:'))?.slice(4), cur = o.intent && o.intent.length === 2 ? o.intent : undefined;
    const arrow = o.intent && o.intent.length >= 4 ? o.intent : undefined, hot = new Set((d.last as string).length ? [(d.last as string).slice(0, 2), (d.last as string).slice(2, 4)] : []);
    g.save(); rp(g, bx - 1, by - 1, cs * 8 + 2, cs * 8 + 2, 6); g.clip();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const n = 'abcdefgh'[c] + (r + 1), [px, py] = at(n);
      g.fillStyle = (c + r) % 2 ? LIGHT : DARK; g.fillRect(px, py, cs, cs);
      if (hot.has(n)) { g.fillStyle = 'rgba(70,84,230,.26)'; g.fillRect(px, py, cs, cs); }
      if (n === sel) { g.fillStyle = 'rgba(70,84,230,.42)'; g.fillRect(px, py, cs, cs); }
      if (n === d.check) for (const [r, a] of [[.5, .25], [.36, .4], [.2, .75]]) dot(g, px + cs / 2, py + cs / 2, cs * r, `rgba(217,80,47,${a})`);
      const edgeC = flip ? 7 : 0, edgeR = flip ? 7 : 0;
      if (c === edgeC) text(g, String(r + 1), px + cs * .06, py + cs * .06 + 7, `500 ${Math.max(7, cs * .17)}px ${MONO}`, C.ink3);
      if (r === edgeR) text(g, 'abcdefgh'[c], px + cs * .94, py + cs * .94, `500 ${Math.max(7, cs * .17)}px ${MONO}`, C.ink3, 'right');
    }
    g.restore();
    d.board.forEach((row: string, i: number) => [...row].forEach((ch, c) => {
      if (ch === '.') return;
      const n = 'abcdefgh'[c] + (8 - i), [px, py] = at(n);
      piece(g, ch, px + cs / 2, py + cs / 2, cs * .86, n === sel && cur && cur !== sel ? .35 : 1);
    }));
    for (const m of marks) {
      const [k, n] = m.split(':');
      if (k !== 'to' && k !== 'cap') continue;
      const [px, py] = at(n);
      if (k === 'cap') { g.save(); g.strokeStyle = 'rgba(21,26,34,.35)'; g.lineWidth = cs * .07; g.beginPath(); g.arc(px + cs / 2, py + cs / 2, cs * .44, 0, 7); g.stroke(); g.restore(); }
      else { g.fillStyle = 'rgba(21,26,34,.22)'; g.beginPath(); g.arc(px + cs / 2, py + cs / 2, cs * .15, 0, 7); g.fill(); }
    }
    if (cur) { const [px, py] = at(cur); ring(g, px, py, cs, C.blue); if (sel && sel !== cur) piece(g, d.board[7 - sq(sel)[1]][sq(sel)[0]], px + cs / 2, py + cs / 2, cs * .86, .6); }
    if (arrow) { const [a, b] = [at(arrow.slice(0, 2)), at(arrow.slice(2, 4))]; intent(g, [[a[0] + cs / 2, a[1] + cs / 2], [b[0] + cs / 2, b[1] + cs / 2]], o.t ?? 0, C.blue); }
    const promo = marks.find((m) => m.startsWith('promo:'))?.slice(6);
    if (promo) {
      const [c, r] = sq(promo), row = flip ? r : 7 - r, dir = row === 0 ? 1 : -1, px = X(flip ? 7 - c : c);
      g.fillStyle = 'rgba(255,255,255,.96)'; g.strokeStyle = C.ink; g.lineWidth = 1;
      rp(g, px, Y(.5 + Math.min(row, row + 3 * dir)), cs, cs * 4, 8); g.fill(); g.stroke();
      ['q', 'r', 'b', 'n'].forEach((p, i) => piece(g, d.turn === 'w' ? p.toUpperCase() : p, px + cs / 2, Y(.5 + row + i * dir) + cs / 2, cs * .8));
    }
    const bottom = flip ? 'b' : 'w', top = flip ? 'w' : 'b';
    for (const [side, y] of [[top, Y(0) + cs * .25], [bottom, Y(8.5) + cs * .25]] as const) {
      const got = d.lost[side === 'w' ? 'b' : 'w'] as string, diff = tally(got) - tally(d.lost[side]);
      let x = bx + cs * .1;
      for (const ch of [...got].sort((a, b) => val(b) - val(a))) { piece(g, ch, x + cs * .17, y, cs * .38); x += cs * .2; }
      if (diff > 0) text(g, `+${diff}`, x + cs * .3, y + 4, `500 ${Math.max(9, cs * .22)}px ${MONO}`, C.ink2);
      if (!over && d.turn === side) { g.fillStyle = C.blue; g.beginPath(); g.arc(bx + cs * 8 - cs * .15, y, cs * .09, 0, 7); g.fill(); }
    }
    if (over) {
      const [x, y] = [bx + cs * 4, by + cs * 4], tw = Math.min(cs * 7, Math.max(cs * 3, (d.say as string).length * cs * .3));
      g.fillStyle = 'rgba(255,255,255,.94)'; g.strokeStyle = C.ink; g.lineWidth = 1; rp(g, x - tw / 2, y - cs * .45, tw, cs * .9, 10); g.fill(); g.stroke();
      text(g, d.say, x, y, `700 ${Math.max(11, cs * .4)}px ${SANS}`, C.ink, 'center', 'middle');
    }
  },
  hit(d, w, h, x, y) {
    const { cs, X, Y, flip } = geo(d, w, h), c = Math.floor((x - X(0)) / cs), r = Math.floor((y - Y(.5)) / cs);
    return c < 0 || c > 7 || r < 0 || r > 7 ? null : 'abcdefgh'[flip ? 7 - c : c] + (flip ? r + 1 : 8 - r);
  },
};
