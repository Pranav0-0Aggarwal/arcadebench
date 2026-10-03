import { drawInt } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';

/** cells: '.' clear, 'C' coin, 'W' wall (change lane), 'L' low barrier (jump), 'H' high bar (slide) */
const ROWS = 600, LANES = 3, ACTIONS = ['left', 'right', 'jump', 'slide', 'stay'];
export interface LaneState { seed: number; row: number; lane: number; coins: number; dead: boolean }

const cache = new Map<number, { track: string[]; V: Float64Array }>();
/** the track comes from stream 12; every obstacle row keeps one clear lane, and obstacles sit on even rows only */
function trackOf(seed: number) {
  const hit = cache.get(seed); if (hit) return hit;
  const track: string[] = [];
  for (let r = 0; r <= ROWS; r++) {
    let row = ['.', '.', '.'];
    if (r >= 6 && r % 2 === 0) {
      const safe = drawInt(seed, 12, r * 5, 3);
      row = row.map((_, l) => (l === safe ? (drawInt(seed, 12, r * 5 + 1, 3) === 0 ? 'C' : '.') : 'W.LHW'[drawInt(seed, 12, r * 5 + 2 + l, 5)]));
    } else if (r >= 6 && drawInt(seed, 12, r * 5 + 4, 3) === 0) row[drawInt(seed, 12, r * 5 + 3, 3)] = 'C';
    track.push(row.join(''));
  }
  // exact backward DP: V[r*3+l] = best score still to earn from row r in lane l
  const V = new Float64Array((ROWS + 1) * LANES);
  for (let r = ROWS - 1; r >= 0; r--) for (let l = 0; l < LANES; l++) {
    let best = 0;
    for (const a of ACTIONS) { const m = enter(track, r, l, a); if (m && !m.dead) best = Math.max(best, m.gain + V[(r + 1) * LANES + m.lane]); }
    V[r * LANES + l] = best;
  }
  const t = { track, V }; cache.set(seed, t); return t;
}

function enter(track: string[], row: number, lane: number, a: string): { lane: number; dead: boolean; gain: number } | null {
  const nl = a === 'left' ? lane - 1 : a === 'right' ? lane + 1 : lane;
  if (nl < 0 || nl >= LANES) return null;
  const c = track[row + 1][nl];
  const dead = c === 'W' || (c === 'L' && a !== 'jump') || (c === 'H' && a !== 'slide');
  return { lane: nl, dead, gain: dead ? 0 : 1 + (c === 'C' ? 5 : 0) };
}

export const lanes: Game<LaneState> = {
  id: 'lanes', prefix: 'LNR', name: 'Lane runner', version: '1.0.0', realtime: { framesPerStep: 8, defaultAction: 'stay' }, maxSteps: ROWS,
  rules: 'A three-lane runner. Each step you advance one row and may move one lane left or right, jump, slide, or stay. Walls (W) block a lane; low barriers (L) must be jumped; high bars (H) must be slid under; coins (C) are worth 5. Hitting anything ends the run. Score: rows survived plus 5 per coin; the course is 600 rows. On timed tracks a row passes every 8 frames at 60 frames per second, and you stay in your lane while you think.',
  init: (seed) => { trackOf(seed); return { seed, row: 0, lane: 1, coins: 0, dead: false }; },
  legal: (s) => ACTIONS.filter((a) => !((a === 'left' && s.lane === 0) || (a === 'right' && s.lane === LANES - 1))),
  step(s, a) {
    const { track } = trackOf(s.seed), m = lanes.legal(s).includes(a) ? enter(track, s.row, s.lane, a) : null;
    if (!m) illegal('lanes', a, lanes.legal(s));
    const coin = !m.dead && track[s.row + 1][m.lane] === 'C';
    return { seed: s.seed, row: s.row + 1, lane: m.lane, coins: s.coins + (coin ? 1 : 0), dead: m.dead };
  },
  done: (s) => s.dead || s.row >= ROWS,
  score: (s) => (s.dead ? s.row - 1 : s.row) + 5 * s.coins,
  render(s) {
    const { track } = trackOf(s.seed), lines: string[] = [];
    for (let k = 8; k >= 1; k--) if (s.row + k <= ROWS) lines.push(`+${k} ${track[s.row + k].split('').join(' ')}`);
    lines.push(`you ${[0, 1, 2].map((l) => (l === s.lane ? '@' : '_')).join(' ')}`);
    return `${lines.join('\n')}\nRows ahead are listed top (far) to bottom (next). W wall, L low barrier (jump), H high bar (slide), C coin. row ${s.row}/${ROWS}  coins ${s.coins}`;
  },
  data: (s) => { const { track } = trackOf(s.seed); return { row: s.row, lane: s.lane, coins: s.coins, ahead: track.slice(s.row + 1, s.row + 9) }; },
  label: (_s, a) => ({ left: 'move one lane left', right: 'move one lane right', jump: 'jump (clears a low barrier)', slide: 'slide (passes under a high bar)', stay: 'stay in lane' })[a]!,
  features(s, a) { const { track } = trackOf(s.seed), m = enter(track, s.row, s.lane, a)!; return { laneAfter: m.lane, nextCellBlocked: m.dead ? 1 : 0, coinNext: track[s.row + 1][m.lane] === 'C' ? 1 : 0 }; },
  values(s) {
    const { track, V } = trackOf(s.seed), out: Record<string, number> = {};
    for (const a of lanes.legal(s)) { const m = enter(track, s.row, s.lane, a)!; out[a] = m.dead ? 0 : m.gain + V[(s.row + 1) * LANES + m.lane]; }
    return out;
  },
  valuesExact: true,
};
