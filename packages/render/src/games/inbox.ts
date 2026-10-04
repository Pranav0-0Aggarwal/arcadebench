import { C, fresh, MONO, SANS, text, type Pt, type Renderer } from '../frame.ts';
import { paragraph, scene, spot } from '../lab.ts';
import { box, HAIR, TINT, verdict } from '../parts.ts';

const dims: Pt = [9, 14.5], TW = 108, TH = 50, DW = 166, DH = 28;
const TYPES = ['otp', 'expense', 'income', 'bill', 'delivery', 'alert', 'personal', 'promo', 'spam'];
const CATS = ['food', 'groceries', 'shopping', 'transport', 'travel', 'bills', 'entertainment', 'health', 'transfer', 'other'];
const NOTE: Record<string, string> = { otp: 'one-time code', expense: 'money out', income: 'money in', bill: 'bill or due date', delivery: 'order or parcel', alert: 'security, trips', personal: 'from a person', promo: 'real offers', spam: 'scam, phishing' };
const tray = (i: number): [number, number, number, number] => [10 + (i % 3) * (TW + 8), 184 + Math.floor(i / 3) * (TH + 8), TW, TH];
const drawer = (i: number): [number, number, number, number] => [10 + (i % 2) * (DW + 8), 372 + Math.floor(i / 2) * (DH + 6), DW, DH];
const inside = (x: number, y: number, [rx, ry, rw, rh]: number[]) => x >= rx && y >= ry && x < rx + rw && y < ry + rh;
const cap = (s: string) => (s === 'otp' ? 'OTP' : s[0].toUpperCase() + s.slice(1));
const key = (i: number) => String((i + 1) % 10);

export const inbox: Renderer = {
  dims,
  draw(g, d, w, h, o) {
    scene(g, w, h, dims, d, () => {
      const narrow = w < 320, last = d.last && !d.open && fresh(o, 1500) ? d.last : null, n: Record<string, number> = d.n ?? {};
      if (d.item) {
        text(g, d.item.from, narrow ? 14 : 34, 20, `600 12.5px ${MONO}`, C.ink2);
        if (!narrow) { g.fillStyle = HAIR; g.beginPath(); g.arc(20, 16, 6, 0, 7); g.fill(); }
      }
      box(g, 10, 28, 340, 136, 16, '#fff', C.ink);
      g.beginPath(); g.moveTo(28, 163); g.lineTo(16, 177); g.lineTo(46, 163); g.fillStyle = '#fff'; g.fill();
      g.strokeStyle = C.ink; g.lineWidth = 1.5; g.beginPath(); g.moveTo(28, 164); g.lineTo(16, 177); g.lineTo(46, 164); g.stroke();
      g.fillStyle = '#fff'; g.fillRect(29, 162.5, 16, 3);
      if (d.item) paragraph(g, d.item.text, 24, 44, 312, narrow ? 19 : 17.5, narrow ? 5 : 6, `500 ${narrow ? 15.5 : 14}px ${SANS}`, C.ink);
      else text(g, `finished: ${d.correct} points`, 180, 96, `700 18px ${SANS}`, C.ink, 'center', 'middle');
      const stamp = (r: number[], right: boolean) => verdict(g, r[0] + r[2] - 24, r[1] - 3, right ? '+1' : 'oops', right ? C.teal : C.red);
      const lit = (r: number[], id: string) => {
        if (o.intent !== id) return;
        g.save(); g.setLineDash([6, 4]); g.lineDashOffset = -(o.t ?? 0) / 45;
        box(g, r[0] - 3, r[1] - 3, r[2] + 6, r[3] + 6, 12, undefined, C.blue);
        g.restore();
      };
      TYPES.forEach((id, i) => {
        const r = tray(i), on = last?.pick === id, picked = d.open === id;
        box(g, r[0], r[1], r[2], r[3], 10, on ? (last.right ? TINT.good : TINT.bad) : picked ? '#e9ecff' : '#fff', picked ? C.blue : HAIR);
        text(g, cap(id), r[0] + 10, r[1] + (narrow ? 31 : 21), `700 ${narrow ? 17 : 15}px ${SANS}`, C.ink);
        if (!narrow) { text(g, NOTE[id], r[0] + 10, r[1] + 38, `11px ${SANS}`, C.ink2); text(g, key(i), r[0] + r[2] - 8, r[1] + r[3] - 8, `500 11px ${MONO}`, C.ink3, 'right'); }
        text(g, String(n[id] ?? 0), r[0] + r[2] - 8, r[1] + (narrow ? 30 : 20), `500 13px ${MONO}`, C.ink2, 'right');
        if (on) stamp(r, last.right);
        lit(r, id);
      });
      text(g, d.open ? 'Which spending category?' : 'spending category, opens on expense', 12, 364, `${d.open ? 700 : 400} ${narrow ? 12.5 : 11.5}px ${d.open ? SANS : MONO}`, d.open ? C.ink : C.ink3);
      g.globalAlpha = d.open ? 1 : .4;
      CATS.forEach((id, i) => {
        const r = drawer(i), on = last?.sub === id && last.right;
        box(g, r[0], r[1], r[2], r[3], 8, on ? (last.subRight ? TINT.good : TINT.bad) : '#fff', d.open ? C.ink2 : HAIR);
        text(g, cap(id), r[0] + 10, r[1] + 19, `700 ${narrow ? 14 : 13}px ${SANS}`, C.ink);
        text(g, String(n[id] ?? 0), r[0] + r[2] - 8, r[1] + 19, `500 12px ${MONO}`, C.ink2, 'right');
        if (!narrow) text(g, key(i), r[0] + r[2] - 34, r[1] + 19, `500 11px ${MONO}`, C.ink3, 'right');
        if (on) stamp(r, last.subRight);
        if (d.open) lit(r, id);
      });
      g.globalAlpha = 1;
      box(g, 10, 546, 340, 26, 8, '#fff', HAIR);
      text(g, d.miss ? `top mistake: ${d.miss[0]} → ${d.miss[1]} ×${d.miss[2]}` : 'top mistake: none yet', 20, 563, `${narrow ? 12.5 : 12}px ${MONO}`, C.ink2);
    });
  },
  hit(d, w, h, x, y) {
    const [px, py] = spot(dims, w, h, x, y), t = TYPES.findIndex((_, i) => inside(px, py, tray(i))), c = CATS.findIndex((_, i) => inside(px, py, drawer(i)));
    return t >= 0 ? TYPES[t] : d.open && c >= 0 ? CATS[c] : null;
  },
};
