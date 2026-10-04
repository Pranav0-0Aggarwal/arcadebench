import { bin, belt, box, card, chute, COLORS, gate, GROUND, HAIR, lamp, MONO, oops, plug, SANS, spark, trunc, verdict, wire } from '@arcadebench/render';
import { stamp } from '../share/mark.ts';

export type Draw = (g: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
type G = CanvasRenderingContext2D;

const { ink: INK, ink2: INK2, grid: HAIR2, teal: GOOD, red: BAD, amber: WARN } = COLORS;
const MODELS: [string, string, number][] = [['Model A', '#4654e6', 0.93], ['Model B', '#a443bd', 0.87], ['Model C', WARN, 0.8]];

const SMS: [string, boolean][] = [['Your OTP is 482910, valid 5 min', false], ['WIN Rs 25 lakh in KBC lucky draw, call now', true], ['Reached home, call you later', false], ['KYC pending, account blocked: sbi-kyc.co', true], ['Rs 2,499 debited to Zomato', false], ['Pay Rs 49 to release your parcel', true], ['Lunch tomorrow?', false], ['Earn 5000/day liking videos', true], ['Train PNR 4521876630 confirmed', false], ['Bill overdue, power cut tonight, call officer', true]];
const FRAUD: [string, boolean][] = [['TRANSFER  181.00  to C84', true], ['PAYMENT  2,310.50  Swiggy', false], ['CASH_OUT  9,839.64', true], ['PAYMENT  64.20  Metro', false], ['TRANSFER  1,200,000  new payee', true], ['DEBIT  1,250.00  Airtel', false], ['PAYMENT  99.00  Netflix', false], ['CASH_OUT  215,310.30', true]];
const FNS = ['add_todo', 'send_email', 'web_search', 'set_timer', 'read_sms'];
const REQS: [string, number][] = [['Remind me to buy milk tomorrow', 0], ["Email my manager I'll be late", 1], ['Who won the match last night?', 2], ['Wake me up at 7', 3], ['What did mom text me?', 4], ['Put dentist on my list', 0], ['Is it raining in Bengaluru?', 2], ['Reply to Priya: Friday works', 1]];

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t: number) => 1 - (1 - t) ** 3;
const rng = (seed: number) => { let x = seed; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
const right = (rate: number, seed: number, i: number) => { const r = rng(seed * 131 + i * 7919 + 11); r(); return r() < rate; };

function head(g: G, x: number, w: number, name: string, col: string, stats: string) {
  g.font = `13px ${MONO}`;
  if (g.measureText(stats).width > w * 0.42) stats = stats.split(' ')[0];
  const sw = g.measureText(stats).width;
  g.fillStyle = col;
  g.beginPath();
  g.arc(x + 8, 22, 6, 0, 7);
  g.fill();
  g.fillStyle = INK;
  g.font = `700 16px ${SANS}`;
  g.textAlign = 'left';
  g.fillText(trunc(g, name, w - sw - 36), x + 20, 27);
  g.font = `13px ${MONO}`;
  g.fillStyle = INK2;
  g.textAlign = 'right';
  g.fillText(stats, x + w - 6, 27);
  g.textAlign = 'left';
}
const wipe = (g: G, w: number, h: number) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); };

const sms: Draw = (g, W, H, t) => {
  wipe(g, W, H);
  const lw = W / MODELS.length, gap = 760, fly = 1900, binY = H - 168, spawned = Math.max(0, Math.floor(t / gap)), landed = Math.max(0, Math.floor((t - fly) / gap) + 1);
  MODELS.forEach(([name, col, rate], k) => {
    const x = k * lw, cx = x + lw / 2;
    let ok = 0, bad = 0, inbox = 0, spam = 0;
    for (let i = 0; i < landed; i++) {
      const sp = SMS[i % SMS.length][1], r = right(rate, k, i);
      r ? ok++ : bad++;
      (r ? sp : !sp) ? spam++ : inbox++;
    }
    g.save();
    g.beginPath();
    g.rect(x, 0, lw, H - 28);
    g.clip();
    if (k) { g.fillStyle = HAIR2; g.fillRect(x, 0, 1, H - 28); }
    head(g, x + 10, lw - 20, name, col, `${ok}/${landed} right`);
    g.fillStyle = GROUND;
    g.fillRect(x + 16, 38, lw - 32, 6);
    g.fillStyle = col;
    g.fillRect(x + 16, 38, (lw - 32) * (landed ? ok / Math.max(landed, 12) : 0), 6);
    chute(g, cx, 60, binY - 90, binY - 14, lw * 0.22);
    ([['Inbox', -1, GOOD, inbox], ['Spam', 1, BAD, spam]] as const).forEach(([label, side, c, n]) => {
      const bw = lw * 0.36, bx = cx + side * lw * 0.22 - bw / 2;
      bin(g, bx, binY, bw, label, n, c);
    });
    oops(g, cx, H - 58, bad);
    for (let i = Math.max(0, spawned - 3); i <= spawned; i++) {
      const age = t - i * gap;
      if (age < 0 || age > fly + 600) continue;
      const [txt, sp] = SMS[i % SMS.length], ok2 = right(rate, k, i), side = (ok2 ? sp : !sp) ? 1 : -1, p = Math.min(1, age / fly);
      let mx = cx, my: number, alpha = 1, fill = '#fff', stroke = INK;
      if (p < 0.6) my = 72 + (binY - 170) * ease(p / 0.6);
      else { const q = ease((p - 0.6) / 0.4); my = binY - 98 + q * 96; mx = cx + side * lw * 0.22 * q; }
      if (age > fly) {
        const f = (age - fly) / 600;
        if (!ok2) { fill = '#fde7e2'; stroke = BAD; my += f * (H - 60 - my); mx += (cx - mx) * f; }
        alpha = 1 - f;
      }
      const full = Math.min(lw - 28, 220), chip = (lw * 0.36 - 16) / 5 - 4, sh = p < 0.6 ? 1 : 1 - ease((p - 0.6) / 0.4), bw = chip + (full - chip) * sh, bh = 12 + 22 * sh;
      g.globalAlpha = alpha;
      if (sh < 1 && age <= fly) {
        fill = sh > 0.5 ? '#fff' : side > 0 ? '#fde7e2' : '#dff2ee';
        stroke = sh > 0.5 ? INK : side > 0 ? BAD : GOOD;
      }
      box(g, mx - bw / 2, my - bh / 2, bw, bh, 3 + 7 * sh, fill, stroke);
      if (sh > 0.35) {
        g.globalAlpha = alpha * Math.min(1, (sh - 0.35) / 0.4);
        g.fillStyle = INK;
        g.font = `13px ${SANS}`;
        g.fillText(trunc(g, txt, bw - 22), mx, my + 5);
        g.globalAlpha = alpha;
      }
      if (age > fly) {
        const f = (age - fly) / 600;
        g.font = `800 ${20 + f * 8}px ${SANS}`;
        g.fillStyle = ok2 ? GOOD : BAD;
        g.fillText(ok2 ? '+1' : 'oops', mx, my - 26 - f * 26);
      }
      g.globalAlpha = 1;
    }
    g.textAlign = 'left';
    g.restore();
  });
  g.fillStyle = HAIR2;
  g.fillRect(0, H - 28, W, 1);
};

const fraud: Draw = (g, W, H, t) => {
  wipe(g, W, H);
  const lh = (H - 30) / MODELS.length, period = 2000, n = Math.floor(t / period), ph = (t % period) / period, gateX = W * 0.55;
  MODELS.forEach(([name, col, rate], k) => {
    let caught = 0, missed = 0, alarms = 0;
    for (let i = 0; i < n; i++) {
      const f = FRAUD[i % FRAUD.length][1], r = right(rate, k + 10, i);
      if (f && r) caught++;
      else if (f) missed++;
      else if (!r) alarms++;
    }
    g.save();
    g.translate(0, k * lh);
    if (k) { g.fillStyle = HAIR2; g.fillRect(0, 0, W, 1); }
    head(g, 14, W - 28, name, col, `caught ${caught} · missed ${missed} · false alarms ${alarms}`);
    const by = lh * 0.72;
    belt(g, 14, by, W - 28, t);
    const [txt, isF] = FRAUD[n % FRAUD.length], ok = right(rate, k + 10, n), flag = isF ? ok : !ok, gp = clamp((ph - 0.3) / 0.12);
    gate(g, gateX, by, flag, gp);
    g.font = `12px ${MONO}`;
    for (let q = 1; q <= 3; q++) {
      const qx = gateX - 200 - q * 196 + ph * 196;
      if (qx < -180) continue;
      g.globalAlpha = 0.45;
      box(g, qx, by - 48, 176, 34, 8, '#fff', HAIR);
      g.fillStyle = INK2;
      g.fillText(trunc(g, FRAUD[(n + q) % FRAUD.length][0], 160), qx + 8, by - 26);
      g.globalAlpha = 1;
    }
    let px = -190 + (W + 230) * ease(ph);
    if (flag) px = Math.min(px, gateX - 184);
    box(g, px, by - 48, 176, 34, 8, '#fff', INK);
    g.fillStyle = INK;
    g.fillText(trunc(g, txt, 160), px + 8, by - 26);
    if (ph > 0.5) {
      const f = Math.min(1, (ph - 0.5) / 0.15), v = isF && flag ? ['CAUGHT', GOOD] : isF ? ['MISSED', BAD] : flag ? ['FALSE ALARM', WARN] : null;
      if (v) verdict(g, isF && !flag ? Math.min(px + 72, W - 90) : gateX - 80, by - 70, v[0], v[1], f);
    }
    g.restore();
  });
};

const tools: Draw = (g, W, H, t) => {
  wipe(g, W, H);
  const period = 2600, n = Math.floor(t / period), ph = (t % period) / period, [req, ans] = REQS[n % REQS.length], rx = 40, ry = H / 2 - 40, rw = W * 0.3;
  card(g, rx, ry, rw, 80, 'user request');
  g.fillStyle = INK;
  g.font = `700 17px ${SANS}`;
  g.fillText(trunc(g, req, rw - 28), rx + 14, ry + 54);
  const sx = W * 0.74, sockets = FNS.map((_, i) => [sx, 56 + i * ((H - 140) / (FNS.length - 1))]);
  sockets.forEach(([x, y], i) => {
    plug(g, x, y - 18, W * 0.2, 36, i === ans && ph > 0.62 ? GOOD : HAIR);
    g.fillStyle = INK;
    g.font = `13px ${MONO}`;
    g.fillText(FNS[i], x + 30, y + 5);
  });
  MODELS.forEach(([, col, rate], k) => {
    const ok = right(rate, k + 20, n), pick = ok ? ans : (ans + 1 + k) % FNS.length, [tx, ty] = sockets[pick], p = ease(clamp((ph - 0.08 * k) / 0.5));
    const x0 = rx + rw, y0 = ry + 40 + (k - 1) * 14, x1 = x0 + (tx + 14 - x0) * p, y1 = y0 + (ty - y0) * p;
    wire(g, x0, y0, x1, y1, col);
    if (p < 1 || ph <= 0.6) return;
    const f = Math.min(1, (ph - 0.6) / 0.2);
    if (ok) lamp(g, tx + 14, ty, f);
    else spark(g, tx + 14, ty, f, k);
  });
  let lx = rx;
  MODELS.forEach(([name, col, rate], k) => {
    let ok = 0;
    for (let i = 0; i < n; i++) if (right(rate, k + 20, i)) ok++;
    g.fillStyle = col;
    g.fillRect(lx, H - 50, 14, 4);
    g.fillStyle = INK;
    g.font = `700 14px ${SANS}`;
    g.fillText(name, lx + 20, H - 44);
    g.fillStyle = INK2;
    g.font = `13px ${MONO}`;
    g.fillText(` ${ok}/${n}`, lx + 24 + g.measureText(name).width * 1.1, H - 44);
    lx += W * 0.22;
  });
};

const marked = (draw: Draw, ds: string): Draw => (g, w, h, t) => { draw(g, w, h, t); stamp(g, w, h, ds, 'Illustration'); };

export const SCENES = {
  sms: marked(sms, 'SMS Spam Collection (UCI)'),
  fraud: marked(fraud, 'PaySim'),
  tools: marked(tools, 'BFCL v3'),
};
export type SceneId = keyof typeof SCENES;
