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
  hint: 'Left and Right slide the piece, Up rotates it, Space or Down drops it.',
  pad: [['ArrowLeft', '←', 'Left'], ['ArrowUp', '⟳', 'Rotate'], ['ArrowRight', '→', 'Right'], [' ', 'Drop', 'Drop']],
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

const minesweeper = (): Ctl => ({
  hint: 'Click a cell, or move with the arrow keys and press Space. A covered cell that touches no number reveals a random covered cell elsewhere.',
  pad: [], pointer: true,
  sync: (_l, prev) => prev ?? 'r8c8',
  down(k, h) {
    const [y, x] = nums(h.cursor!), { width, height, cells } = h.data, d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
    if (d) h.set(`r${clamp(y + d[0], height)}c${clamp(x + d[1], width)}`);
    else if (k === ' ' || k === 'Enter') {
      const a = h.legal.includes(h.cursor!) ? h.cursor! : 'interior';
      if (cells[y][x] < 0 && h.legal.includes(a)) h.play(a);
    } else return false;
    return true;
  },
});

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

const V: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const snake = (): Ctl => {
  let want: [number, number] | null = null;
  return {
    hint: 'Arrow keys steer the snake. Esc pauses.', start: 'Press an arrow key to start', pad: DPAD,
    down(k) { if (!V[k]) return false; want = V[k]; return true; },
    act(h) {
      const [hx, hy] = h.data.heading as [number, number], w = want;
      want = null;
      return w && w[0] === hy && w[1] === -hx ? 'left' : w && w[0] === -hy && w[1] === hx ? 'right' : 'straight';
    },
    reset() { want = null; },
  };
};

const dino = (): Ctl => {
  const held = new Set<string>();
  return {
    hint: 'Space or Up jumps, Down ducks. Esc pauses.', start: 'Press Space to start',
    pad: [['ArrowDown', 'Duck', 'Duck'], [' ', 'Jump', 'Jump']],
    down(k) { if (k !== ' ' && k !== 'ArrowUp' && k !== 'ArrowDown') return false; held.add(k); return true; },
    up: (k) => { held.delete(k); },
    act: () => (held.has(' ') || held.has('ArrowUp') ? 'jump' : held.has('ArrowDown') ? 'duck' : 'wait'),
    reset: () => held.clear(),
  };
};

const LANE: Record<string, string> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ' ': 'jump', ArrowDown: 'slide' };
const lanes = (): Ctl => {
  let next = 'stay';
  return {
    hint: 'Left and Right change lane, Space or Up jumps, Down slides. Esc pauses.', start: 'Press an arrow key to start',
    pad: [['ArrowLeft', '←', 'Left'], ['ArrowUp', 'Jump', 'Jump'], ['ArrowRight', '→', 'Right'], null, ['ArrowDown', 'Slide', 'Slide'], null],
    down(k) { if (!LANE[k]) return false; next = LANE[k]; return true; },
    act(h) { const a = h.legal.includes(next) ? next : 'stay'; next = 'stay'; return a; },
    reset() { next = 'stay'; },
  };
};

export const CONTROLS: Record<string, () => Ctl> = {
  tetris, snake, minesweeper, connect4, dino, lanes, beams,
  '2048': direct('Arrow keys slide the tiles.', ARROWS, DPAD),
  sokoban: direct('Arrow keys walk and push boxes.', ARROWS, DPAD),
  shifting: direct('Arrow keys move, Space takes the object you stand on.', { ...ARROWS, ' ': 'take' }, [...DPAD, [' ', 'Take', 'Take']]),
  courier: direct('Arrow keys drive, P picks up, D drops off, W waits.', { ArrowUp: 'north', ArrowDown: 'south', ArrowLeft: 'west', ArrowRight: 'east', p: 'pickup', d: 'dropoff', w: 'wait' },
    [...DPAD, ['p', 'Pick up', 'Pick up'], ['d', 'Drop off', 'Drop off'], ['w', 'Wait', 'Wait']]),
};
