import { useEffect, useReducer, useRef, useState } from 'react';
import { GAMES } from '@arcadebench/engine';
import { CONTROLS, type Host } from './controls.ts';
import { ratio } from '@arcadebench/render';
import GameCanvas from './GameCanvas.tsx';
import { pts } from '../components/format.ts';
import './game.css';

export interface PlayerProps { game: string; seed: number; onDone: (actions: string[], final: unknown) => void }

const FRAME = 1000 / 60;

export default function Player({ game, seed, onDone }: PlayerProps) {
  const g = GAMES[game], ctl = useState(() => CONTROLS[game]())[0], timed = !!ctl.act;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [S] = useState(() => { const s = g.init(seed); return { s, prev: undefined as typeof s | undefined, n: 0, log: [] as string[], cursor: ctl.sync?.(g.legal(s)), started: !timed, paused: false }; });
  const ended = () => g.done(S.s) || S.n >= g.maxSteps;
  const done = useRef(onDone);
  done.current = onDone;

  const [host] = useState<Host>(() => ({
    get legal() { return g.legal(S.s); },
    get data() { return g.data(S.s); },
    get cursor() { return S.cursor; },
    set(c) { S.cursor = c; bump(); },
    play(a) {
      if (S.paused || ended()) return;
      if (g.legal(S.s).length > 1) S.log.push(a);
      S.prev = S.s; S.s = g.step(S.s, a); S.n++;
      if (ended()) done.current([...S.log], S.s); else S.cursor = ctl.sync?.(g.legal(S.s), S.cursor);
      bump();
    },
    back() {
      if (!S.prev || ended()) return;
      S.s = S.prev; S.prev = undefined; S.n--; S.log.pop(); S.cursor = ctl.sync?.(g.legal(S.s), S.cursor);
      bump();
    },
  }));

  const pause = (on: boolean) => { if (!timed || !S.started || ended() || S.paused === on) return; S.paused = on; ctl.reset?.(); bump(); };
  const press = (k: string) => {
    if (S.paused || ended()) return false;
    const ok = ctl.down(k, host);
    if (ok && !S.started) { S.started = true; bump(); }
    return ok;
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || ((e.key === ' ' || e.key === 'Enter') && t.closest('button,a'))) return;
      if (e.key === 'Escape' && timed) return pause(!S.paused);
      if (press(e.key.length === 1 ? e.key.toLowerCase() : e.key)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => ctl.up?.(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const away = () => pause(true);
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', away); document.addEventListener('visibilitychange', away);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', away); document.removeEventListener('visibilitychange', away); };
  }, []);

  useEffect(() => {
    if (!ctl.act) return;
    const dt = g.realtime ? g.realtime.framesPerStep * FRAME : 120;
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      acc += Math.min(now - last, 100); last = now;
      if (!S.started || S.paused || ended()) { acc = 0; return; }
      while (acc >= dt && !ended()) { acc -= dt; host.play(ctl.act!(host)); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const over = ended();
  return (
    <div className="player">
      <div className="hud"><div>score<b>{pts(g.score(S.s))}</b></div><div>moves<b>{S.n}</b></div></div>
      <div className="board" style={{ ['--r' as string]: ratio(game) }}>
        <GameCanvas game={game} state={S.s} intent={over ? undefined : S.cursor} marks={ctl.marks?.(host)} onHit={ctl.pointer ? (id, how) => { S.cursor = id; if (how) press(how === 'alt' ? 'f' : how === 'up' ? 'Release' : 'Enter'); else bump(); } : undefined} />
        {timed && !over && (!S.started || S.paused) && <div className="veil" role="status">{S.paused ? 'Paused. Press Esc to resume.' : ctl.start}</div>}
      </div>
      <p className="keys">{ctl.hint}</p>
      {ctl.pad.length > 0 && (
        <div className="pad" aria-label="On-screen controls">
          {ctl.pad.map((p, i) => p
            ? <button key={i} type="button" aria-label={p[2]} aria-pressed={ctl.lit ? ctl.lit(p[0]) : undefined} onPointerDown={() => press(p[0])} onPointerUp={() => ctl.up?.(p[0])} onPointerCancel={() => ctl.up?.(p[0])} onPointerLeave={() => ctl.up?.(p[0])} onClick={(e) => { if (e.detail === 0) { press(p[0]); ctl.up?.(p[0]); } }}>{p[1]}</button>
            : <span key={i} />)}
        </div>
      )}
    </div>
  );
}
