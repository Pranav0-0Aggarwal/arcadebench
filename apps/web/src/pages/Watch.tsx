import { useEffect, useRef } from 'react';
import { API, BASE_PATH, SITE_ORIGIN } from '@arcadebench/api';
import { GAMES } from '@arcadebench/engine';
import { ratio } from '@arcadebench/render';
import { Link } from '../components/Chrome.tsx';
import Combine from '../components/Combine.tsx';
import { Credit } from '../components/Credit.tsx';
import { META } from '../components/games.ts';
import { ms, who } from '../components/format.ts';
import { useTitle } from '../components/hooks.ts';
import GameCanvas from '../game/GameCanvas.tsx';
import Strip from '../game/Strip.tsx';
import { navigate, usePath } from '../lib/router.ts';
import { track } from '../lib/track.ts';
import { useWatch } from '../lib/watch.ts';
import ClipBar from '../share/ClipBar.tsx';
import { watchSource } from '../share/whole.ts';
import WatchGrid, { PILL, Stats } from './WatchGrid.tsx';
import './pages.css';

const num = (v: number) => String(+v.toFixed(2));
function Single({ id }: { id: string }) {
  const { frame: f, state } = useWatch(id), cur = useRef(f), g = f && GAMES[f.game];
  cur.current = f;
  useEffect(() => { track('watch_open'); }, [id]);
  useEffect(() => {
    if (f || state !== 'gone') return;
    fetch(`${API}/watch/${encodeURIComponent(id)}`).then((r) => r.json()).then((j) => { if (j.runId) navigate(`/run/${encodeURIComponent(j.runId)}`); }, () => {});
  }, [f, state, id]);
  useTitle(g ? `${g.name} · ${who(f.entry)}` : 'Watch');
  const back = <Link to="/" className="back">Back to home</Link>;

  if (!f) {
    return state === 'gone'
      ? <main>{back}<h1>Game not found</h1><p className="lede">This watch link is wrong or has expired. <Link to="/leaderboard">See the leaderboard</Link> for finished runs.</p></main>
      : <main>{back}<h1>Watch</h1><p className="lede" role="status">Connecting to the game…</p></main>;
  }
  if (!g) return <main>{back}<h1>Watch</h1><p className="lede">This game is not available in this version of ArcadeBench.</p></main>;

  const text = `${f.entry?.name ?? 'Anonymous'} scored ${f.score} on ArcadeBench ${g.name} ${f.seedCode}, watch: ${SITE_ORIGIN}${BASE_PATH}/watch/${encodeURIComponent(id)}`;
  const l = f.last;
  return (
    <main>
      {back}
      <div className="wtitle">
        <h1>{g.name}</h1>
        <span className={`pill ${state}`} role="status">{state === 'live' && <i aria-hidden="true" />}{PILL[state]}</span>
      </div>
      <p className="who">
        {f.entry ? <><b>{f.entry.name}</b>{f.entry.x && <> <a href={`https://x.com/${encodeURIComponent(f.entry.x)}`} rel="noopener noreferrer">@{f.entry.x}</a></>}<span className="num">· {f.mode}</span></> : 'Anonymous practice'}
      </p>
      {state === 'gone' && <p className="err" role="alert">This watch link has expired. The last frame is shown.</p>}
      <div className="watch-grid" style={{ ['--r' as string]: ratio(f.game) }}>
        <div className="wboard"><GameCanvas game={f.game} data={f.data} label={`${g.name}. Score ${f.score}, step ${f.step}.${f.done ? ' Finished.' : ''}`} /></div>
        <div className="wside">
          <div className="stats"><Stats f={f} /></div>
          <p className="who">Seed <span className="num">{f.seedCode}</span> · <Link to={`/play?seed=${encodeURIComponent(f.seedCode)}`}>Play this exact game yourself</Link></p>
          <div className="analysis">
            <h3>Last move</h3>
            {l
              ? <p>Played <b className="num">{l.action}</b>, expert <b className="num">{l.expert}</b>, regret <b className="num">{num(l.regret)}</b>, <span className={l.agree ? 'ok' : 'bad'}>{l.agree ? 'matched the expert' : 'differed from the expert'}</span>{l.invalid ? ', invalid move' : ''}{l.latencyMs !== undefined ? `, thought for ${ms(l.latencyMs)}` : ''}.</p>
              : <p>Waiting for the first move.</p>}
          </div>
          {state === 'done' && f.runId && <p className="row"><Link to={`/run/${encodeURIComponent(f.runId)}`} className="btn">See the finished run</Link></p>}
        </div>
      </div>
      <h3 className="strip-h">Regret per move</h3>
      {META[f.game].data && <p className="hint"><Credit id={META[f.game].data!} /></p>}
      <Strip bars={f.regrets.map((regret, step) => ({ step, regret, agree: regret === 0 }))} n={Math.max(1, f.regrets.length)} />
      <ClipBar src={() => watchSource(id)} name={`arcadebench-${f.game}-${f.seedCode}`} text={text} />
      <Combine have={[id]} label="Watch together with up to 3 other games" />
    </main>
  );
}

export default function Watch() {
  const seg = usePath().split('/')[2] ?? '', ids = decodeURIComponent(seg).split(',');
  return ids.length > 1 ? <WatchGrid ids={[...new Set(ids.filter(Boolean))].slice(0, 4)} /> : <Single id={seg} />;
}
