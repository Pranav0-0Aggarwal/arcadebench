import { useEffect, useState } from 'react';
import type { LiveSession } from '@arcadebench/api';
import { GAMES } from '@arcadebench/engine';
import { api } from '../lib/api.ts';
import { Link } from './Chrome.tsx';
import { who } from './format.ts';

export const watchPath = (w: string) => `/watch/${encodeURIComponent(w)}`;

export function useLive() {
  const [live, set] = useState<LiveSession[] | null>();
  useEffect(() => {
    const go = () => api.live().then(set, () => set(null));
    go();
    const t = setInterval(() => document.hidden || go(), 10000);
    return () => clearInterval(t);
  }, []);
  return live;
}

export default function LiveNow({ compact }: { compact?: boolean }) {
  const live = useLive();
  return (
    <section className={`live${compact ? ' compact' : ''}`} aria-labelledby="live-h" aria-busy={live === undefined}>
      <h2 id="live-h">Live now{!!live?.length && <span className="num live-n">{live.length}</span>}</h2>
      {live?.length ? (
        <ul>
          {live.slice(0, 12).map((s) => (
            <li key={s.watch}>
              <Link to={watchPath(s.watch)} className="live-card">
                <b>{GAMES[s.game]?.name ?? s.game}</b>
                <span>{who(s.entry)}</span>
                <span className="num">step {s.step} · score {s.score}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : live === undefined ? <p className="empty">Looking for live games…</p>
        : live === null ? <p className="empty">Live games are unavailable right now.</p>
        : <p className="empty">No games running right now. <Link to="/connect">Connect your AI</Link> or <Link to="/play">play one yourself</Link>.</p>}
    </section>
  );
}
