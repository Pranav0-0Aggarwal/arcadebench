import { useEffect, useMemo, useRef, type PointerEvent } from 'react';
import { GAMES } from '@arcadebench/engine';
import { draw, fit, hit, ratio } from '@arcadebench/render';

export const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface GameCanvasProps {
  game: string;
  state: unknown;
  intent?: string;
  decorative?: boolean;
  className?: string;
  onHit?: (id: string, click: boolean) => void;
  onVisible?: (visible: boolean) => void;
}

export default function GameCanvas({ game, state, intent, decorative, className, onHit, onVisible }: GameCanvasProps) {
  const g = GAMES[game], ref = useRef<HTMLCanvasElement>(null), seen = useRef(true), vis = useRef(onVisible), data = useMemo(() => g.data(state), [g, state]);
  vis.current = onVisible;
  const paint = useRef((_t: number) => {});
  paint.current = (t) => { const c = ref.current; if (c) { const f = fit(c); draw(f.g, game, data, f.w, f.h, { t: calm() ? 0 : t, intent }); } };

  useEffect(() => {
    const c = ref.current!, redraw = () => paint.current(performance.now());
    const ro = new ResizeObserver(redraw), io = new IntersectionObserver(([e]) => { seen.current = e.isIntersecting; vis.current?.(e.isIntersecting); if (e.isIntersecting) redraw(); }, { threshold: .05 });
    ro.observe(c); io.observe(c);
    document.fonts.ready.then(redraw);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);

  useEffect(() => {
    paint.current(performance.now());
    if (!intent || calm()) return;
    let raf = 0, last = 0;
    const tick = (now: number) => { raf = requestAnimationFrame(tick); if (seen.current && now - last > 33) { last = now; paint.current(now); } };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data, intent]);

  const point = (click: boolean) => (e: PointerEvent<HTMLCanvasElement>) => {
    if (!onHit || (!click && e.pointerType !== 'mouse')) return;
    const r = e.currentTarget.getBoundingClientRect(), id = hit(game, data, r.width, r.height, e.clientX - r.left, e.clientY - r.top);
    if (id) onHit(id, click);
  };
  const label = `${g.name}. Score ${g.score(state)}.${g.done(state) ? ' Finished.' : ''}${g.realtime || decorative ? '' : `\n${g.render(state)}`}`;
  return <canvas ref={ref} className={className} style={{ aspectRatio: ratio(game) }} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : label} aria-hidden={decorative || undefined} onPointerMove={point(false)} onPointerDown={point(true)} />;
}
