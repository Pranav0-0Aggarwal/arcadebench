import { useEffect, useRef } from 'react';
import type { Draw } from './scenes.ts';

const STILL = 5200;

function paint(c: HTMLCanvasElement, draw: Draw, t: number) {
  const r = c.getBoundingClientRect(), d = devicePixelRatio || 1, w = Math.round(r.width * d), h = Math.round(r.height * d);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d')!;
  g.setTransform(d, 0, 0, d, 0, 0);
  draw(g, r.width, r.height, t);
}
const key = (c: HTMLCanvasElement) => { const r = c.getBoundingClientRect(); return `${r.width}x${r.height}`; };

export function useScene(draw: Draw, paused: boolean) {
  const ref = useRef<HTMLCanvasElement>(null), rec = useRef(0), last = useRef('');
  useEffect(() => {
    const c = ref.current!, t0 = performance.now();
    let seen = false, raf = 0;
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; }, { threshold: 0.1 });
    io.observe(c);
    document.fonts.ready.then(() => { last.current = ''; });
    const tick = (now: number) => {
      if (rec.current) paint(c, draw, now - rec.current);
      else if (seen && (!paused || last.current !== key(c))) {
        paint(c, draw, paused ? STILL : now - t0);
        last.current = key(c);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [draw, paused]);
  const capture = async (run: (c: HTMLCanvasElement) => Promise<void>) => {
    rec.current = performance.now();
    try { await run(ref.current!); } finally { rec.current = 0; last.current = ''; }
  };
  return { ref, capture };
}
