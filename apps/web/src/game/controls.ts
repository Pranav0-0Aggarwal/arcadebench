import type { GameId } from '@arcadebench/engine';

export interface Host { legal: string[]; data: any; cursor?: string; set(c: string): void; play(a: string): void }
export type Pad = [key: string, label: string, name: string] | null;
export interface Ctl {
  hint: string;
  start?: string;
  pad: Pad[];
  pointer?: boolean;
  sync?(legal: string[], prev?: string): string;
  down(k: string, h: Host): boolean;
  up?(k: string): void;
  act?(h: Host): string;
  reset?(): void;
  marks?(h: Host): string[];
  lit?(k: string): boolean;
}

const ARROWS: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const DPAD: Pad[] = [null, ['ArrowUp', '↑', 'Up'], null, ['ArrowLeft', '←', 'Left'], ['ArrowDown', '↓', 'Down'], ['ArrowRight', '→', 'Right']];
const clamp = (v: number, n: number) => Math.max(0, Math.min(n - 1, v));
const nums = (id: string) => [...id.matchAll(/\d+/g)].map((m) => +m[0]);

const direct = (hint: string, keys: Record<string, string>, pad: Pad[]) => (): Ctl => ({
  hint, pad,
  down(k, h) { const a = keys[k]; if (!a) return false; if (h.legal.includes(a)) h.play(a); return true; },
});

const nearest = (legal: string[], r: number, x: number) => {
  const xs = legal.map(nums).filter((p) => p[0] === r).map((p) => p[1]);
  return xs.length ? `r${r}c${xs.reduce((b, v) => (Math.abs(v - x) < Math.abs(b - x) ? v : b))}` : undefined;
};
const tetris = (): Ctl => ({
  hint: 'Placement Tetris: no gravity and no timer, so take your time. Left and Right slide the piece along the top, Up rotates it, Space or Down drops it straight down onto the dashed outline. Pieces cannot slide under overhangs.',
  pad: [['ArrowLeft', '←', 'Left'], ['ArrowUp', '⟳', 'Rotate'], ['ArrowRight', '→', 'Right'], null, [' ', 'Drop', 'Drop'], null],
  sync(legal, prev) { const [r, x] = prev ? nums(prev) : [0, 4]; return nearest(legal, r, x) ?? nearest(legal, nums(legal[0])[0], x)!; },
  down(k, h) {
    const [r, x] = nums(h.cursor!), xs = h.legal.map(nums).filter((p) => p[0] === r).map((p) => p[1]).sort((a, b) => a - b), rs = [...new Set(h.legal.map((l) => nums(l)[0]))].sort((a, b) => a - b);
    if (k === 'ArrowLeft' || k === 'ArrowRight') { const n = k === 'ArrowLeft' ? xs.filter((v) => v < x).pop() : xs.find((v) => v > x); if (n !== undefined) h.set(`r${r}c${n}`); }
    else if (k === 'ArrowUp') h.set(nearest(h.legal, rs[(rs.indexOf(r) + 1) % rs.length], x)!);
    else if (k === 'ArrowDown' || k === ' ') h.play(h.cursor!);
    else return false;
    return true;
  },
});

const minesweeper = (): Ctl => {
  const flags = new Set<string>();
  let flagging = false;
  return {
    hint: 'Click a covered cell to reveal it. Right-click or press F to flag a cell you think hides a mine; flags are only notes for you. On touch, tap Flag to switch between revealing and flagging. Arrow keys move, Space reveals.',
    pad: [null, ['flag', 'Flag', 'Flag mode'], null], pointer: true,
    marks: (h) => [...flags].filter((c) => h.legal.includes(c)),
    lit: (k) => k === 'flag' && flagging,
    sync: (_l, prev) => prev ?? 'r8c8',
    down(k, h) {
      const c = h.cursor!, [y, x] = nums(c), { width, height } = h.data, d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
      if (d) h.set(`r${clamp(y + d[0], height)}c${clamp(x + d[1], width)}`);
      else if (k === 'flag') { flagging = !flagging; h.set(c); }
      else if (k === 'f' || (flagging && (k === ' ' || k === 'Enter'))) { if (h.legal.includes(c) && !flags.delete(c)) flags.add(c); h.set(c); }
      else if (k === ' ' || k === 'Enter') { if (!flags.has(c) && h.legal.includes(c)) h.play(c); }
      else return false;
      return true;
    },
  };
};

const connect4 = (): Ctl => ({
  hint: 'Click a column, or choose with Left and Right and drop with Space. Keys 1 to 7 drop directly.',
  pad: [], pointer: true,
  sync: (legal, prev) => (prev && legal.includes(prev) ? prev : legal.includes('c3') ? 'c3' : legal[0]),
  down(k, h) {
    const c = nums(h.cursor!)[0];
    if (k === 'ArrowLeft' || k === 'ArrowRight') h.set(`c${clamp(c + (k === 'ArrowLeft' ? -1 : 1), 7)}`);
    else if (k === ' ' || k === 'Enter' || k === 'ArrowDown') { if (h.legal.includes(h.cursor!)) h.play(h.cursor!); }
    else if (/^[1-7]$/.test(k)) { if (h.legal.includes(`c${+k - 1}`)) h.play(`c${+k - 1}`); }
    else return false;
    return true;
  },
});

const beams = (): Ctl => ({
  hint: 'Click a mirror to flip it, or press its number. Left and Right select a mirror, Space flips it.',
  pad: [], pointer: true,
  sync: (_l, prev) => prev ?? 'flip0',
  down(k, h) {
    const m = nums(h.cursor!)[0];
    if (/^[1-6]$/.test(k)) h.play(`flip${+k - 1}`);
    else if (k === 'ArrowLeft' || k === 'ArrowUp') h.set(`flip${(m + 5) % 6}`);
    else if (k === 'ArrowRight' || k === 'ArrowDown') h.set(`flip${(m + 1) % 6}`);
    else if (k === ' ' || k === 'Enter') h.play(h.cursor!);
    else return false;
    return true;
  },
});

const choose = (hint: string, pad: Pad[], key: (k: string, legal: string[]) => string | undefined) => (): Ctl => ({
  hint, pad, pointer: true,
  down(k, h) {
    const a = k === ' ' || k === 'Enter' ? h.cursor : key(k, h.legal);
    if (!a) return false;
    if (h.legal.includes(a)) h.play(a);
    return true;
  },
});
const sorter = choose('Left or I delivers the message to the inbox, Right or S marks it as spam. You can also click or tap a bin.', [['ArrowLeft', 'Inbox', 'Inbox'], null, ['ArrowRight', 'Spam', 'Spam']], (k) => ({ ArrowLeft: 'inbox', i: 'inbox', ArrowRight: 'spam', s: 'spam' })[k]);
const checkpoint = choose('A lets the payment through, F flags it as fraud. You can also click or tap a gate.', [['a', 'Allow', 'Allow'], null, ['f', 'Flag', 'Flag']], (k) => ({ a: 'allow', f: 'flag' })[k]);
const switchboard = choose('Press the number of the function that fits the request, or click or tap a function.', [], (k, legal) => (/^[1-9]$/.test(k) ? legal[+k - 1] : undefined));

const V: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const snake = (): Ctl => {
  let q: [number, number][] = [];
  return {
    hint: 'Arrow keys steer the snake; two quick presses make a U-turn. Esc pauses.', start: 'Press or tap an arrow to start', pad: DPAD,
    down(k) { if (!V[k]) return false; if (q.length < 2) q.push(V[k]); return true; },
    act(h) {
      const [hx, hy] = h.data.heading as [number, number];
      for (let w = q.shift(); w; w = q.shift()) {
        if (w[0] === hy && w[1] === -hx) return 'left';
        if (w[0] === -hy && w[1] === hx) return 'right';
      }
      return 'straight';
    },
    reset() { q = []; },
  };
};

const dino = (): Ctl => {
  const held = new Set<string>();
  return {
    hint: 'Space or Up jumps, Down ducks (in the air it drops faster). Jump low birds and cacti, duck under mid birds, ignore high birds. Esc pauses.', start: 'Press Space or tap Jump to start',
    pad: [['ArrowDown', 'Duck', 'Duck'], null, [' ', 'Jump', 'Jump']],
    down(k) { if (k !== ' ' && k !== 'ArrowUp' && k !== 'ArrowDown') return false; held.add(k); return true; },
    up: (k) => { held.delete(k); },
    act: () => (held.has(' ') || held.has('ArrowUp') ? 'jump' : held.has('ArrowDown') ? 'duck' : 'wait'),
    reset: () => held.clear(),
  };
};

const LANE: Record<string, string> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ' ': 'jump', ArrowDown: 'slide' };
const lanes = (): Ctl => {
  let next = 'stay', ttl = 0;
  return {
    hint: 'Left and Right change lane, Space or Up jumps a low barrier, Down slides under a high bar. A jump or slide pressed one row early is held for the row that needs it. Esc pauses.', start: 'Press or tap an arrow to start',
    pad: [['ArrowLeft', '←', 'Left'], ['ArrowUp', 'Jump', 'Jump'], ['ArrowRight', '→', 'Right'], null, ['ArrowDown', 'Slide', 'Slide'], null],
    down(k) { if (!LANE[k]) return false; next = LANE[k]; ttl = 2; return true; },
    act(h) {
      const a = h.legal.includes(next) ? next : 'stay', { ahead, lane } = h.data;
      if (--ttl > 0 && (a === 'jump' || a === 'slide') && '.C'.includes(ahead[0][lane])) return 'stay';
      next = 'stay';
      return a;
    },
    reset() { next = 'stay'; ttl = 0; },
  };
};

export const CONTROLS: Record<string, () => Ctl> = {
  tetris, snake, minesweeper, connect4, dino, lanes, beams, sorter, checkpoint, switchboard,
  '2048': direct('Arrow keys slide the tiles.', ARROWS, DPAD),
  sokoban: direct('Arrow keys walk and push boxes onto the rings. Boxes cannot be pulled and there is no undo. Each puzzle gives you 60 moves.', ARROWS, DPAD),
  shifting: direct('The arrow keys move you, but not always the way they point: work out the mapping, and which shapes score. Space takes the shape you stand on.', { ...ARROWS, ' ': 'take' }, [...DPAD, [' ', 'Take', 'Take']]),
  courier: direct('Arrow keys drive, P picks up, D drops off, W waits. Teal pins are parcels to collect, purple pins are where your parcels go, the number under a pin is its due tick, and red crosses are closed roads.', { ArrowUp: 'north', ArrowDown: 'south', ArrowLeft: 'west', ArrowRight: 'east', p: 'pickup', d: 'dropoff', w: 'wait' },
    [...DPAD, ['p', 'Pick up', 'Pick up'], ['d', 'Drop off', 'Drop off'], ['w', 'Wait', 'Wait']]),
} satisfies Record<GameId, () => Ctl>;
