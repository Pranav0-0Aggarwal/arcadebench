import { useEffect, useMemo, useRef, useState } from 'react';
import { GAMES } from '@arcadebench/engine';
import type { RunDecision } from '@arcadebench/api';
import { ratio } from '@arcadebench/render';
import { unit } from '../components/format.ts';
import GameCanvas from './GameCanvas.tsx';
import ClipBar from '../share/ClipBar.tsx';
import Strip from './Strip.tsx';
import './game.css';

export interface ReplayProps { game: string; seed: number; actions: string[]; decisions?: RunDecision[]; className?: string; share?: { who: string; seedCode: string; text: string } }

const SPEEDS = [1, 2, 4];
const num = (v: number) => String(+v.toFixed(2));

export default function Replay({ game, seed, actions, decisions, className, share }: ReplayProps) {
  const g = GAMES[game], n = actions.length;
  const states = useMemo(() => {
    const out = [g.init(seed)];
    for (const a of actions) { const s = out[out.length - 1]; out.push(!g.done(s) && g.legal(s).includes(a) ? g.step(s, a) : s); }
    return out;
  }, [g, seed, actions]);
  const [at, setAt] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(0);
  const rate = (g.realtime ? 60 / g.realtime.framesPerStep : 6) * SPEEDS[speed];

  const from = useRef(0);
  from.current = at;
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now(), a0 = from.current;
    const id = setInterval(() => setAt(Math.min(n, a0 + Math.floor((performance.now() - t0) * rate / 1000))), 30);
    return () => clearInterval(id);
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
      {decisions && n > 0 && <Strip bars={decisions} n={n} at={at} onSeek={(i) => { setPlaying(false); setAt(i); }} />}
      {share && <ClipBar src={() => ({ game, seed, actions, who: share.who, seedCode: share.seedCode })} name={`arcadebench-${game}-${share.seedCode}`} text={share.text} />}
      {decisions && (
        <div className="analysis" aria-live="polite">
          {d
            ? <p>Move {at + 1}: played <b className="num">{d.action}</b>, expert <b className="num">{d.expert}</b>, regret <b className="num">{num(d.regret)}</b>{unit(game)}, <span className={d.agree ? 'ok' : 'bad'}>{d.agree ? 'matched the expert' : 'differed from the expert'}</span>{d.forced ? ', forced' : ''}{d.invalid ? ', invalid move' : ''}.</p>
            : <p>{at < n ? <>Move {at + 1}: <b className="num">{actions[at]}</b>, played while the agent was thinking or forced.</> : <>Finished after {n} moves.</>}</p>}
          <h3>Costliest moves</h3>
          {worst.length
            ? <ol>{worst.map((x) => <li key={x.step}><button type="button" onClick={() => { setPlaying(false); setAt(x.step); }}>move {x.step + 1}: <span className="num">{x.action}</span> instead of <span className="num">{x.expert}</span>, regret <span className="num">{num(x.regret)}</span>{unit(game)}</button></li>)}</ol>
            : <p>Every move cost nothing against the expert.</p>}
        </div>
      )}
    </div>
  );
}
