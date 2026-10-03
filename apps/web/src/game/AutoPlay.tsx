import { useEffect, useRef, useState } from 'react';
import { drawInt, expertAction, GAMES } from '@arcadebench/engine';
import GameCanvas, { calm } from './GameCanvas.tsx';

export interface AutoPlayProps { game: string; seed: number; policy: 'expert' | 'random'; speed?: number; className?: string }

const PACE: Record<string, number> = { tetris: 450, '2048': 350, snake: 110, sokoban: 260, minesweeper: 350, connect4: 800, shifting: 260, beams: 700, courier: 160 };
const REST = 1800, GLANCE = 20;

export default function AutoPlay({ game, seed, policy, speed = 1, className }: AutoPlayProps) {
  const g = GAMES[game], seen = useRef(true), rate = useRef(speed), sim = useRef<{ key: string; s: unknown; n: number; a: string }>(undefined);
  const [view, setView] = useState<{ s: unknown; a?: string }>(() => ({ s: g.init(seed) }));
  const still = speed === 0 || calm();
  rate.current = speed;

  useEffect(() => {
    const pick = (s: unknown, i: number) => { if (g.done(s)) return ''; if (policy === 'expert') return expertAction(g, s); const l = g.legal(s); return l[drawInt(seed ^ 0x5eed, 900, i, l.length)]; };
    const key = `${game}/${seed}/${policy}`;
    if (sim.current?.key !== key) {
      let s = g.init(seed), n = 0, a = pick(s, 0);
      if (still) for (; n < GLANCE && !g.done(s); n++) { s = g.step(s, a); a = pick(s, n + 1); }
      sim.current = { key, s, n, a };
    }
    const m = sim.current;
    setView({ s: m.s, a: still ? undefined : m.a || undefined });
    if (still) return;
    const base = g.realtime ? g.realtime.framesPerStep * 1000 / 60 : PACE[game];
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!seen.current) { last = now; return; }
      const dt = base / rate.current;
      acc += Math.min(now - last, 250); last = now;
      if (g.done(m.s)) {
        if (acc < REST) return;
        m.s = g.init(seed); m.n = 0; m.a = pick(m.s, 0); acc = 0;
        setView({ s: m.s, a: m.a });
        return;
      }
      if (acc < dt) return;
      for (let k = 0; k < 4 && acc >= dt && !g.done(m.s); k++) { acc -= dt; m.s = g.step(m.s, m.a); m.a = pick(m.s, ++m.n); }
      acc = Math.min(acc, dt);
      setView({ s: m.s, a: m.a || undefined });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [g, game, seed, policy, still]);

  return <GameCanvas game={game} state={view.s} intent={view.a} decorative className={className} onVisible={(v) => { seen.current = v; }} />;
}
