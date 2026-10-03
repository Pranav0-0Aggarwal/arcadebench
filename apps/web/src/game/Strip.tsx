import { useEffect, useRef, type PointerEvent } from 'react';
import { COLORS, fit } from '@arcadebench/render';
import './game.css';

export interface Bar { step: number; regret: number; agree: boolean }

export default function Strip({ bars, n, at, onSeek }: { bars: Bar[]; n: number; at?: number; onSeek?: (i: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, max = Math.max(1e-9, ...bars.map((d) => d.regret));
    const paint = () => {
      const { g, w, h } = fit(c), bw = w / n;
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#cfd6df'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, h - .5); g.lineTo(w, h - .5); g.stroke();
      for (const d of bars) {
        const bh = Math.max(1.5, d.regret / max * (h - 8));
        g.fillStyle = d.agree ? COLORS.teal : COLORS.red; g.globalAlpha = d.agree ? .45 : 1;
        g.fillRect(d.step * bw, h - bh, Math.max(1, bw - .6), bh);
      }
      g.globalAlpha = 1;
      if (at !== undefined) { g.fillStyle = COLORS.ink; g.fillRect(Math.min(w - 1.5, at * bw), 0, 1.5, h); }
    };
    paint();
    const ro = new ResizeObserver(paint); ro.observe(c);
    return () => ro.disconnect();
  }, [bars, at, n]);
  const seek = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!onSeek || (e.type === 'pointermove' && !e.buttons)) return;
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(n, Math.floor((e.clientX - r.left) / r.width * n))));
  };
  return <canvas ref={ref} className="strip" aria-hidden="true" onPointerDown={seek} onPointerMove={seek} />;
}
