import { useEffect, useState } from 'react';
import { BASE_PATH, SITE_ORIGIN, type RunRes } from '@arcadebench/api';
import { GAMES, parseSeedCode } from '@arcadebench/engine';
import { ms, pctl } from '../components/format.ts';
import { Link } from '../components/Chrome.tsx';
import Replay from '../game/Replay.tsx';
import { api } from '../lib/api.ts';
import { usePath } from '../lib/router.ts';
import { track } from '../lib/track.ts';
import './pages.css';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function Run() {
  const id = usePath().split('/')[2], [run, setRun] = useState<RunRes>(), [err, setErr] = useState('');
  useEffect(() => { setRun(undefined); setErr(''); api.run(id).then(setRun, (e: Error) => setErr(e.message)); }, [id]);

  if (err) return <main><h1>Run not found</h1><p className="lede">{err}</p><p className="lede"><Link to="/leaderboard">See the leaderboard</Link></p></main>;
  if (!run) return <main><h1>Run</h1><p className="lede" role="status">Loading the run…</p></main>;

  const g = GAMES[run.game], p = parseSeedCode(run.seedCode), free = run.decisions.filter((d) => !d.forced);
  const lat = free.flatMap((d) => (d.latencyMs === undefined ? [] : [d.latencyMs])), agree = free.length ? free.filter((d) => d.agree).length / free.length : null, mean = run.decisions.length ? run.decisions.reduce((a, d) => a + d.regret, 0) / run.decisions.length : null;
  return (
    <main>
      <Link to="/leaderboard" className="back">Back to the leaderboard</Link>
      <h1>{g?.name ?? run.game} · {run.entry.name}</h1>
      <p className="who">{run.entry.badge === 'official' ? 'Official baseline' : 'Registered entry'}{run.entry.x && ` · @${run.entry.x}`}<span className="num">{run.seedCode} · {run.track} track · help level {run.help}</span></p>
      <div className="stats">
        <div>score<b>{run.score}</b></div>
        <div>normalized<b>{run.normalized === null ? 'Not rated' : run.normalized.toFixed(2)}</b></div>
        <div>moves<b>{run.steps}</b></div>
        <div>matched the expert<b>{agree === null ? 'n/a' : pct(agree)}</b></div>
        <div>mean regret<b>{mean === null ? 'n/a' : +mean.toFixed(2)}</b></div>
        <div>think time, median<b>{ms(pctl(lat, .5))}</b></div>
        <div>think time, p95<b>{ms(pctl(lat, .95))}</b></div>
      </div>
      <section className="panel">
        {g && p ? <Replay game={run.game} seed={p.seed} actions={run.actions} decisions={run.decisions} share={{ who: run.entry.x ? `${run.entry.name} @${run.entry.x}` : run.entry.name, seedCode: run.seedCode, text: `${run.entry.name} scored ${run.score} on ArcadeBench ${g.name} ${run.seedCode}, replay: ${SITE_ORIGIN}${BASE_PATH}/run/${encodeURIComponent(run.id)}` }} /> : <p className="lede">This run was played on a different version of the game, so it cannot be replayed here.</p>}
        <div className="row"><Link to={`/play?seed=${run.seedCode}`} className="btn" onClickCapture={() => track('play_seed')}>Play this seed yourself</Link></div>
      </section>
    </main>
  );
}
