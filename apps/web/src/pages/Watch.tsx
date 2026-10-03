import { useEffect, useRef } from 'react';
import { API, BASE_PATH, SITE_ORIGIN } from '@arcadebench/api';
import { GAMES, parseSeedCode } from '@arcadebench/engine';
import { ratio, stats } from '@arcadebench/render';
import { Link } from '../components/Chrome.tsx';
import { who } from '../components/format.ts';
import { useTitle } from '../components/hooks.ts';
import GameCanvas from '../game/GameCanvas.tsx';
import Strip from '../game/Strip.tsx';
import { usePath } from '../lib/router.ts';
import { track } from '../lib/track.ts';
import { useWatch } from '../lib/watch.ts';
import ClipBar from '../share/ClipBar.tsx';
import './pages.css';

const num = (v: number) => String(+v.toFixed(2));
const PILL = { connecting: 'Connecting…', live: 'Live', done: 'Finished', gone: 'Expired' };

export default function Watch() {
  const id = usePath().split('/')[2] ?? '', { frame: f, state } = useWatch(id), cur = useRef(f), g = f && GAMES[f.game];
  cur.current = f;
  useEffect(() => { track('watch_open'); }, [id]);
  useTitle(g ? `${g.name} · ${who(f.entry)}` : 'Watch');
  const back = <Link to="/" className="back">Back to home</Link>;

  if (!f) {
    return state === 'gone'
      ? <main>{back}<h1>Game not found</h1><p className="lede">This watch link is wrong or has expired. <Link to="/leaderboard">See the leaderboard</Link> for finished runs.</p></main>
      : <main>{back}<h1>Watch</h1><p className="lede" role="status">Connecting to the game…</p></main>;
  }
  if (!g) return <main>{back}<h1>Watch</h1><p className="lede">This game is not available in this version of ArcadeBench.</p></main>;

  const src = async () => {
    const r = await fetch(`${API}/watch/${encodeURIComponent(id)}`).then((x) => (x.ok ? x.json() : Promise.reject(new Error('This game is no longer available'))));
    return { game: r.game, seed: parseSeedCode(r.seedCode)!.seed, actions: r.actions ?? [], who: who(r.entry), seedCode: r.seedCode };
  };
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
          <div className="stats">{(() => { const st = stats(f.game, f.data, f.score); return <>{[st.head, ...st.rows].map(([k, v]) => <div key={k}>{k}<b>{v}</b></div>)}<div>step<b>{f.step}</b></div>{st.badge && <span className="badge">{st.badge}</span>}</>; })()}</div>
          <p className="who">Seed <span className="num">{f.seedCode}</span> · <Link to={`/play?seed=${encodeURIComponent(f.seedCode)}`}>Play this exact game yourself</Link></p>
          <div className="analysis">
            <h3>Last move</h3>
            {l
              ? <p>Played <b className="num">{l.action}</b>, expert <b className="num">{l.expert}</b>, regret <b className="num">{num(l.regret)}</b>, <span className={l.agree ? 'ok' : 'bad'}>{l.agree ? 'matched the expert' : 'differed from the expert'}</span>{l.invalid ? ', invalid move' : ''}.</p>
              : <p>Waiting for the first move.</p>}
          </div>
          {state === 'done' && f.runId && <p className="row"><Link to={`/run/${encodeURIComponent(f.runId)}`} className="btn">See the finished run</Link></p>}
        </div>
      </div>
      <h3 className="strip-h">Regret per move</h3>
      <Strip bars={f.regrets.map((regret, step) => ({ step, regret, agree: regret === 0 }))} n={Math.max(1, f.regrets.length)} />
      <ClipBar src={src} name={`arcadebench-${f.game}-${f.seedCode}`} text={text} />
    </main>
  );
}
