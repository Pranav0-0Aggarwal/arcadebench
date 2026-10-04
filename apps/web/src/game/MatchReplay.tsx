import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchRecord } from '@arcadebench/api';
import { replayLine } from '@arcadebench/engine';
import { ratio } from '@arcadebench/render';
import { Moves } from '../components/Match.tsx';
import { cap, MARK, matchData, sanOf } from '../components/match.ts';
import ClipBar from '../share/ClipBar.tsx';
import { matchSource } from '../share/whole.ts';
import GameCanvas from './GameCanvas.tsx';
import Strip from './Strip.tsx';
import './game.css';

const SPEEDS = [1, 2, 4], COLORS = ['white', 'black'] as const;
const num = (v: number) => String(+v.toFixed(1));

export default function MatchReplay({ m, actions, text, name }: { m: MatchRecord; actions: string[]; text: string; name: string }) {
  const line = useMemo(() => replayLine(actions), [actions]), n = line.length - 1;
  const data = useMemo(() => line.map((s, i) => matchData(s, m, i, i === n)), [line, m, n]);
  const [at, setAt] = useState(n), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(0);
  const rate = 1.5 * SPEEDS[speed], from = useRef(0);
  from.current = at;
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now(), a0 = from.current;
    const id = setInterval(() => setAt(Math.min(n, a0 + Math.floor((performance.now() - t0) * rate / 1000))), 30);
    return () => clearInterval(id);
  }, [playing, rate, n]);
  useEffect(() => { if (at >= n) setPlaying(false); }, [at, n]);
  const seek = (i: number) => { setPlaying(false); setAt(i); };
  const worst = useMemo(() => COLORS.map((_, c) => m.grades.flatMap((g, i) => (g && i % 2 === c && g.loss > 0 ? [{ i, g, san: m.sans[i], best: sanOf(line[i].fen, g.best) }] : [])).sort((a, b) => b.g.loss - a.g.loss).slice(0, 5)), [m, line]);
  const g = m.grades[at - 1], bars = useMemo(() => m.grades.flatMap((x, step) => (x ? [{ step, regret: x.loss, agree: x.loss === 0 }] : [])), [m]);
  return (
    <div className="replay">
      <div className="board" style={{ ['--r' as string]: ratio('chess') }}><GameCanvas game="chess" data={data[at]} label={`Chess, ${m.sans.length} moves. Position after move ${at}.`} /></div>
      <div className="transport">
        <button type="button" className="btn ghost" onClick={() => { if (at >= n) setAt(0); setPlaying(!playing); }}>{playing ? 'Pause' : at >= n ? 'Replay' : 'Play'}</button>
        <button type="button" className="btn ghost" aria-label="Previous move" disabled={at === 0} onClick={() => seek(at - 1)}>←</button>
        <button type="button" className="btn ghost" aria-label="Next move" disabled={at >= n} onClick={() => seek(at + 1)}>→</button>
        <button type="button" className="btn ghost" aria-label="Playback speed" onClick={() => setSpeed((speed + 1) % SPEEDS.length)}>{SPEEDS[speed]}×</button>
        <span className="num">ply {at} of {n}</span>
      </div>
      <input type="range" min={0} max={n} value={at} aria-label="Move" onChange={(e) => seek(+e.target.value)} />
      {bars.length > 0 && <Strip bars={bars} n={Math.max(1, n)} at={at} onSeek={seek} />}
      <ClipBar src={() => matchSource(m, actions)} name={name} text={text} />
      <div className="analysis" aria-live="polite">
        <h3>Moves</h3>
        <Moves sans={m.sans} grades={m.grades} at={at} seek={seek} />
        {at > 0 && <p>Move {((at - 1) >> 1) + 1}: <b className="num">{m.sans[at - 1]}{MARK[g?.tier ?? 0]}</b>{g ? <>, best <b className="num">{sanOf(line[at - 1].fen, g.best)}</b>, lost <b className="num">{num(g.loss)}</b> win-probability points.</> : ', not graded (computer or forced).'}</p>}
        {COLORS.map((c, i) => (
          <div key={c}>
            <h3>Costliest moves, {cap(c)}</h3>
            {worst[i].length
              ? <ol>{worst[i].map((x) => <li key={x.i}><button type="button" onClick={() => seek(x.i + 1)}>move {(x.i >> 1) + 1}: <span className="num">{x.san}{MARK[x.g.tier]}</span> instead of <span className="num">{x.best}</span>, lost <span className="num">{num(x.g.loss)}</span> win-probability points</button></li>)}</ol>
              : <p>{m.grades.some((x, k) => x && k % 2 === i) ? 'Every graded move matched the engine.' : 'No graded moves.'}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
