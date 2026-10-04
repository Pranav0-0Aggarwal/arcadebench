import { useEffect, useState } from 'react';
import type { LiveSession } from '@arcadebench/api';
import { GAMES } from '@arcadebench/engine';
import { api } from '../lib/api.ts';
import { navigate } from '../lib/router.ts';
import { Link } from './Chrome.tsx';
import { who } from './format.ts';

export const gridPath = (ws: string[]) => `/watch/${ws.map(encodeURIComponent).join(',')}`;
export const watchPath = (w: string) => gridPath([w]);

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

export default function LiveNow({ compact, together }: { compact?: boolean; together?: boolean }) {
  const live = useLive(), [sel, setSel] = useState<string[]>([]), chosen = sel.filter((w) => live?.some((s) => s.watch === w));
  const pick = (w: string) => setSel(chosen.includes(w) ? chosen.filter((x) => x !== w) : chosen.length < 4 ? [...chosen, w] : chosen);
  return (
    <section className={`live${compact ? ' compact' : ''}`} aria-labelledby="live-h" aria-busy={live === undefined}>
      <h2 id="live-h">Live now{!!live?.length && <span className="num live-n">{live.length}</span>}</h2>
      {live?.length ? (
        <ul>
          {live.slice(0, 12).map((s) => (
            <li key={s.watch} className={together ? 'tog' : undefined}>
              {together && <input type="checkbox" checked={chosen.includes(s.watch)} disabled={!chosen.includes(s.watch) && chosen.length >= 4} onChange={() => pick(s.watch)} aria-label={`Select ${GAMES[s.game]?.name ?? s.game}, ${who(s.entry)}`} />}
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
      {chosen.length > 1 && <div className="together"><button type="button" className="btn" onClick={() => navigate(gridPath(chosen))}>Watch together ({chosen.length})</button></div>}
    </section>
  );
}
