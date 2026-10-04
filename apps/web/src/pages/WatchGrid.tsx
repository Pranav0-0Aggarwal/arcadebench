import { useCallback, useEffect, useState } from 'react';
import { BASE_PATH, SITE_ORIGIN, type LiveFrame } from '@arcadebench/api';
import { GAMES } from '@arcadebench/engine';
import { ratio, stats } from '@arcadebench/render';
import { Link } from '../components/Chrome.tsx';
import Combine from '../components/Combine.tsx';
import { Credit } from '../components/Credit.tsx';
import { ms, who } from '../components/format.ts';
import { META } from '../components/games.ts';
import { useFlash, useTitle } from '../components/hooks.ts';
import { gridPath } from '../components/Live.tsx';
import GameCanvas from '../game/GameCanvas.tsx';
import { navigate } from '../lib/router.ts';
import { track } from '../lib/track.ts';
import { useWatch, type Watch } from '../lib/watch.ts';
import ClipBar from '../share/ClipBar.tsx';
import { ended, heading, watchSource, type Tag } from '../share/whole.ts';
import './pages.css';
import './grid.css';

type State = Watch['state'];
export type Shown = Pick<LiveFrame, 'game' | 'seedCode' | 'entry' | 'step' | 'score' | 'data' | 'medianMs'>;

export const PILL = { connecting: 'Connecting…', live: 'Live', done: 'Finished', gone: 'Expired' };

export function Stats({ f }: { f: Shown }) {
  const st = stats(f.game, f.data, f.score);
  return <>{[st.head, ...st.rows].map(([k, v]) => <div key={k}>{k}<b>{v}</b></div>)}<div>step<b>{f.step}</b></div><div>think time<b>{ms(f.medianMs)}</b></div>{st.badge && <span className="badge">{st.badge}</span>}</>;
}

function useBoard(id: string): { frame?: Shown; state: State } {
  const w = useWatch(id), [kept, set] = useState<Shown | null>(), gone = w.state === 'gone' && !w.frame;
  useEffect(() => {
    if (!gone) return;
    let live = true;
    watchSource(id).then((s) => live && set({ game: s.game, seedCode: s.seedCode, entry: s.entry ?? null, medianMs: null, ...ended(s) }), () => live && set(null));
    return () => { live = false; };
  }, [id, gone]);
  return gone ? (kept ? { frame: kept, state: 'done' } : { state: kept === null ? 'gone' : 'connecting' }) : w;
}

interface Seen { state: State; tag?: Tag }

function Tile({ id, on, drop }: { id: string; on: (id: string, s: Seen) => void; drop?: () => void }) {
  const { frame: f, state } = useBoard(id), g = f && GAMES[f.game], x = drop && <button type="button" className="x" aria-label="Remove this game" onClick={drop}>×</button>;
  useEffect(() => on(id, { state, tag: f && { game: f.game, seedCode: f.seedCode, entry: f.entry } }), [id, state, f?.game, f?.seedCode, f?.entry?.name]);
  if (!f || !g) {
    return <section className="tile"><div className="wtitle"><p className="lede" role="status">{f ? 'This game is not available in this version.' : state === 'gone' ? 'Game not found or expired.' : 'Connecting to the game…'} <span className="num">{id}</span></p>{x}</div></section>;
  }
  return (
    <section className="tile">
      <div className="wtitle">
        <h2>{who(f.entry)}</h2>
        <span className={`pill ${state}`} role="status">{state === 'live' && <i aria-hidden="true" />}{PILL[state]}</span>
        {x}
      </div>
      <p className="tg">{g.name} <span className="num">{f.seedCode}</span></p>
      <div className="wboard" style={{ ['--r' as string]: ratio(f.game) }}><GameCanvas game={f.game} data={f.data} label={`${g.name} by ${who(f.entry)}. Score ${f.score}, step ${f.step}.${state === 'done' ? ' Finished.' : ''}`} /></div>
      <div className="stats"><Stats f={f} /></div>
      {META[f.game].data && <p className="hint"><Credit id={META[f.game].data!} /></p>}
      <p className="who"><Link to={`/watch/${encodeURIComponent(id)}`}>Watch this game alone</Link></p>
    </section>
  );
}

export default function WatchGrid({ ids }: { ids: string[] }) {
  const [seen, set] = useState<Record<string, Seen>>({}), [msg, , copy] = useFlash();
  const on = useCallback((id: string, s: Seen) => set((p) => ({ ...p, [id]: s })), []);
  useEffect(() => { track('watch_grid'); }, [ids.join()]);
  useTitle(`${ids.length} games side by side`);
  const up = ids.filter((id) => seen[id]?.state !== 'gone'), done = up.filter((id) => seen[id]?.state === 'done').length, tags = up.flatMap((id) => seen[id]?.tag ?? []);
  const head = up.length > 1 && tags.length === up.length ? heading(tags) : { title: 'Side by side', sub: '' }, url = `${SITE_ORIGIN}${BASE_PATH}${gridPath(ids)}`;
  return (
    <main>
      <Link to="/" className="back">Back to home</Link>
      <div className="wtitle">
        <h1>{head.title}</h1>
        <span className="pill" role="status">{done} of {up.length} finished</span>
      </div>
      {head.sub && <p className="who"><span className="num">{head.sub}</span></p>}
      <div className="share gbar">
        <button type="button" onClick={() => copy(url, 'Link copied')}>Copy link</button>
        <span className="flash" role="status">{msg}</span>
      </div>
      <div className="gtiles">
        {ids.map((id) => <Tile key={id} id={id} on={on} drop={ids.length > 1 ? () => navigate(gridPath(ids.filter((x) => x !== id))) : undefined} />)}
        {ids.length < 4 && <section className="tile"><Combine have={ids} label="Add a game" /></section>}
      </div>
      {up.length > 1 && done === up.length
        ? <ClipBar src={() => Promise.all(up.map(watchSource))} name={`arcadebench-grid-${up.length}`} text={`ArcadeBench: ${head.title}. Watch: ${url}`} />
        : <p className="who" role="status">The clip unlocks when every game has finished ({done} of {up.length} done).</p>}
    </main>
  );
}
