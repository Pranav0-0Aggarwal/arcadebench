import { useEffect, useMemo, useRef, type MouseEvent, type PointerEvent } from 'react';
import { GAMES } from '@arcadebench/engine';
import { draw, fit, hit, ratio } from '@arcadebench/render';

export const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface GameCanvasProps {
  game: string;
  state?: unknown;
  data?: unknown;
  label?: string;
  intent?: string;
  marks?: string[];
  decorative?: boolean;
  className?: string;
  onHit?: (id: string, how: '' | 'click' | 'alt') => void;
  onVisible?: (visible: boolean) => void;
}

export default function GameCanvas({ game, state, data: snap, label: text, intent, marks, decorative, className, onHit, onVisible }: GameCanvasProps) {
  const g = GAMES[game], ref = useRef<HTMLCanvasElement>(null), seen = useRef(true), vis = useRef(onVisible), data = useMemo(() => snap ?? g.data(state), [g, state, snap]), born = useMemo(() => performance.now(), [data]);
  vis.current = onVisible;
  const paint = useRef((_t: number) => {});
  paint.current = (t) => { const c = ref.current; if (c) { const f = fit(c); draw(f.g, game, data, f.w, f.h, { t: calm() ? 0 : t, intent, marks, age: performance.now() - born }); } };

  useEffect(() => {
    const c = ref.current!, redraw = () => paint.current(performance.now());
    const ro = new ResizeObserver(redraw), io = new IntersectionObserver(([e]) => { seen.current = e.isIntersecting; vis.current?.(e.isIntersecting); if (e.isIntersecting) redraw(); }, { threshold: .05 });
    ro.observe(c); io.observe(c);
    document.fonts.ready.then(redraw);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);

  useEffect(() => {
    paint.current(performance.now());
    const late = setTimeout(() => paint.current(performance.now()), 1600);
    if (!intent || calm()) return () => clearTimeout(late);
    let raf = 0, last = 0;
    const tick = (now: number) => { raf = requestAnimationFrame(tick); if (seen.current && now - last > 33) { last = now; paint.current(now); } };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearTimeout(late); };
  }, [data, intent, marks?.join()]);

  const at = (e: MouseEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return hit(game, data, r.width, r.height, e.clientX - r.left, e.clientY - r.top); };
  const point = (how: '' | 'click') => (e: PointerEvent<HTMLCanvasElement>) => {
    if (!onHit || (how ? e.button !== 0 : e.pointerType !== 'mouse')) return;
    const id = at(e);
    if (id) onHit(id, how);
  };
  const alt = (e: MouseEvent<HTMLCanvasElement>) => { if (!onHit) return; e.preventDefault(); const id = at(e); if (id) onHit(id, 'alt'); };
  const label = text ?? `${g.name}. Score ${g.score(state)}.${g.done(state) ? ' Finished.' : ''}${g.realtime || decorative ? '' : `\n${g.render(state)}`}`;
  return <canvas ref={ref} className={className} style={{ aspectRatio: ratio(game) }} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : label} aria-hidden={decorative || undefined} onPointerMove={point('')} onPointerDown={point('click')} onContextMenu={alt} />;
}
