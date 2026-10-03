import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { GAMES } from '@arcadebench/engine';
import type { RunDecision } from '@arcadebench/api';
import { COLORS, fit, ratio } from '@arcadebench/render';
import GameCanvas from './GameCanvas.tsx';
import './game.css';

export interface ReplayProps { game: string; seed: number; actions: string[]; decisions?: RunDecision[]; className?: string }

const SPEEDS = [1, 2, 4];
const num = (v: number) => String(+v.toFixed(2));

function Strip({ decisions, n, at, onSeek }: { decisions: RunDecision[]; n: number; at: number; onSeek: (i: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!, max = Math.max(1e-9, ...decisions.map((d) => d.regret));
    const paint = () => {
      const { g, w, h } = fit(c), bw = w / n;
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#cfd6df'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, h - .5); g.lineTo(w, h - .5); g.stroke();
      for (const d of decisions) {
        const bh = Math.max(1.5, d.regret / max * (h - 8));
        g.fillStyle = d.agree ? COLORS.teal : COLORS.red; g.globalAlpha = d.agree ? .45 : 1;
        g.fillRect(d.step * bw, h - bh, Math.max(1, bw - .6), bh);
      }
      g.globalAlpha = 1; g.fillStyle = COLORS.ink; g.fillRect(Math.min(w - 1.5, at * bw), 0, 1.5, h);
    };
    paint();
    const ro = new ResizeObserver(paint); ro.observe(c);
    return () => ro.disconnect();
  }, [decisions, at, n]);
  const seek = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.type === 'pointermove' && !e.buttons) return;
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(n, Math.floor((e.clientX - r.left) / r.width * n))));
  };
  return <canvas ref={ref} className="strip" aria-hidden="true" onPointerDown={seek} onPointerMove={seek} />;
}

export default function Replay({ game, seed, actions, decisions, className }: ReplayProps) {
  const g = GAMES[game], n = actions.length;
  const states = useMemo(() => {
    const out = [g.init(seed)];
    for (const a of actions) { const s = out[out.length - 1]; out.push(!g.done(s) && g.legal(s).includes(a) ? g.step(s, a) : s); }
    return out;
  }, [g, seed, actions]);
  const [at, setAt] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(0);
  const rate = (g.realtime ? 60 / g.realtime.framesPerStep : 6) * SPEEDS[speed];

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      acc += Math.min(now - last, 250); last = now;
      const k = Math.floor(acc * rate / 1000);
      if (k) { acc -= k * 1000 / rate; setAt((v) => Math.min(n, v + k)); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, n]);
  useEffect(() => { if (at >= n) setPlaying(false); }, [at, n]);

  const byStep = useMemo(() => new Map((decisions ?? []).map((x) => [x.step, x])), [decisions]);
  const d = byStep.get(at), worst = useMemo(() => (decisions ?? []).filter((x) => x.regret > 0).sort((a, b) => b.regret - a.regret).slice(0, 8), [decisions]);
  return (
    <div className={`replay ${className ?? ''}`}>
      <div className="board" style={{ ['--r' as string]: ratio(game) }}><GameCanvas game={game} state={states[at]} intent={at < n ? actions[at] : undefined} /></div>
      <div className="transport">
        <button type="button" className="btn ghost" onClick={() => { if (at >= n) setAt(0); setPlaying(!playing); }}>{playing ? 'Pause' : at >= n ? 'Replay' : 'Play'}</button>
        <button type="button" className="btn ghost" aria-label="Previous move" disabled={at === 0} onClick={() => { setPlaying(false); setAt(at - 1); }}>←</button>
        <button type="button" className="btn ghost" aria-label="Next move" disabled={at >= n} onClick={() => { setPlaying(false); setAt(at + 1); }}>→</button>
        <button type="button" className="btn ghost" aria-label="Playback speed" onClick={() => setSpeed((speed + 1) % SPEEDS.length)}>{SPEEDS[speed]}×</button>
        <span className="num">move {at} of {n}</span>
      </div>
      <input type="range" min={0} max={n} value={at} aria-label="Move" onChange={(e) => { setPlaying(false); setAt(+e.target.value); }} />
      {decisions && n > 0 && <Strip decisions={decisions} n={n} at={at} onSeek={(i) => { setPlaying(false); setAt(i); }} />}
      {decisions && (
        <div className="analysis" aria-live="polite">
          {d
            ? <p>Move {at + 1}: played <b className="num">{d.action}</b>, expert <b className="num">{d.expert}</b>, regret <b className="num">{num(d.regret)}</b>, <span className={d.agree ? 'ok' : 'bad'}>{d.agree ? 'matched the expert' : 'differed from the expert'}</span>{d.forced ? ', forced' : ''}{d.invalid ? ', invalid move' : ''}.</p>
            : <p>{at < n ? <>Move {at + 1}: <b className="num">{actions[at]}</b>, played while the agent was thinking or forced.</> : <>Finished after {n} moves.</>}</p>}
          <h3>Costliest moves</h3>
          {worst.length
            ? <ol>{worst.map((x) => <li key={x.step}><button type="button" onClick={() => { setPlaying(false); setAt(x.step); }}>move {x.step + 1}: <span className="num">{x.action}</span> instead of <span className="num">{x.expert}</span>, regret <span className="num">{num(x.regret)}</span></button></li>)}</ol>
            : <p>Every move cost nothing against the expert.</p>}
        </div>
      )}
    </div>
  );
}
