import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import { BASE_PATH, LIMITS, SITE_ORIGIN, type Listing, type RegisterReq, type VerifyRes } from '@arcadebench/api';
import { GAMES, parseSeedCode } from '@arcadebench/engine';
import { Link } from '../components/Chrome.tsx';
import { Credit } from '../components/Credit.tsx';
import { GROUPS, META } from '../components/games.ts';
import Player from '../game/Player.tsx';
import { api } from '../lib/api.ts';
import { navigate, path } from '../lib/router.ts';
import { track } from '../lib/track.ts';
import './pages.css';

const KEY = 'ab-token';
const saved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const keep = (t: string | null) => { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch {} };
const tokenOf = (link: string) => link.split(/[/?=#]/).pop()!;

function useToast() {
  const [msg, set] = useState(''), timer = useRef(0);
  return [msg, (m: string) => { set(m); clearTimeout(timer.current); timer.current = window.setTimeout(() => set(''), 1800); }] as const;
}

function Form({ onDone }: { onDone: (token: string) => void }) {
  const [who, setWho] = useState('human'), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (who === 'agent') return navigate('/connect');
    const f = new FormData(e.currentTarget), x = String(f.get('x')).trim().replace(/^@/, ''), email = String(f.get('email')).trim(), linkedin = String(f.get('linkedin')).trim();
    if (!LIMITS.xHandle.test(x)) return setErr('Enter your X handle without spaces, up to 15 characters.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Enter a valid email address.');
    setBusy(true); setErr('');
    track('play_signup');
    try {
      const r = await api.register({ kind: 'human', x, email, linkedin: linkedin || undefined, listing: f.get('listing') as Listing, skill: f.get('skill') as RegisterReq['skill'], baselineOptIn: f.get('baseline') === 'on' });
      onDone(tokenOf(r.link));
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <form className="panel form" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="f-x">X handle</label><div className="in"><span>@</span><input id="f-x" name="x" autoComplete="username" placeholder="yourhandle" required /></div><span className="hint">Shown with your score if you list it.</span></div>
      <div className="field"><label htmlFor="f-email">Email</label><div className="in"><input id="f-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div><span className="hint">Private, never shown.</span></div>
      <div className="field"><label htmlFor="f-li">LinkedIn <small>(optional)</small></label><div className="in"><input id="f-li" name="linkedin" type="url" placeholder="linkedin.com/in/you" /></div></div>
      <div className="field"><label htmlFor="f-skill">How often do you play these games?</label><div className="in"><select id="f-skill" name="skill" defaultValue="sometimes"><option value="first-time">First time</option><option value="sometimes">Now and then</option><option value="often">A lot</option></select></div></div>
      <fieldset>
        <legend>Who is playing?</legend>
        <label className="opt"><input type="radio" name="who" value="human" checked={who === 'human'} onChange={() => setWho('human')} /><div><b>I am, a person</b><span>Your runs can join the human baseline if you opt in.</span></div></label>
        <label className="opt"><input type="radio" name="who" value="agent" checked={who === 'agent'} onChange={() => setWho('agent')} /><div><b>An AI agent, through this page</b><span>Computer-use track. Never counted as human.</span></div></label>
      </fieldset>
      {who === 'agent' && <p className="agentnote">Agents playing through the browser register on <Link to="/connect">Connect your AI</Link> in computer-use mode, so their runs land on the right track.</p>}
      {who === 'human' && (
        <fieldset>
          <legend>Scores</legend>
          <label className="opt"><input type="radio" name="listing" value="listed" defaultChecked /><div><b>List my scores publicly</b><span>On the human board with your handle. Listed runs can't be withdrawn.</span></div></label>
          <label className="opt"><input type="radio" name="listing" value="unlisted" /><div><b>Keep them private</b><span>Only you see them.</span></div></label>
          <label className="opt"><input type="checkbox" name="baseline" /><div><b>Count my runs in the anonymous human baseline</b><span>No handle attached.</span></div></label>
        </fieldset>
      )}
      <div className="go"><button type="submit" className="btn" disabled={busy}>{who === 'agent' ? 'Go to Connect your AI' : 'Pick a game'}</button>{err && <p className="err" role="alert">{err}</p>}</div>
    </form>
  );
}

function Picker({ onPick }: { onPick: (game: string) => void }) {
  return (
    <section className="panel">
      <h2>Pick a game</h2>
      <p className="lede" style={{ fontSize: 15 }}>Each game starts on today's public seed, the same one the models play.</p>
      {GROUPS.map(([label, games]) => (
        <div key={label}>
          <h3 className="pick-h">{label}</h3>
          <div className="picker">{games.map((g) => <button key={g.id} type="button" className="pick" onClick={() => onPick(g.id)}><b>{g.name}</b><span>{META[g.id].skills}</span></button>)}</div>
        </div>
      ))}
    </section>
  );
}

function Result({ res, onAgain, say }: { res: VerifyRes; onAgain: () => void; say: (m: string) => void }) {
  const rows = [...res.compare, { name: 'You', score: res.score }].sort((a, b) => b.score - a.score), max = Math.max(1e-9, ...rows.map((r) => r.score));
  const beat = res.compare.filter((m) => res.score > m.score).map((m) => m.name);
  const copy = () => navigator.clipboard.writeText(`${SITE_ORIGIN}${BASE_PATH}/run/${res.runId}`).then(() => { track('copy_result'); say('Result link copied'); }, () => say('Could not copy the link'));
  return (
    <>
      <div className="vs">{rows.map((r) => <div key={r.name} className={`vrow${r.name === 'You' ? ' you' : ''}`}><b>{r.name}</b><span className="num">{r.score}</span><span className="bar"><i style={{ width: `${Math.max(0, r.score) / max * 100}%` }} /></span></div>)}</div>
      <div className="result">
        <p className="hint">Your normalized score</p>
        <div className="big">{res.normalized === null ? 'Not rated' : res.normalized.toFixed(2)}</div>
        <p>{res.compare.length === 0 ? 'No model has played this seed yet.' : beat.length ? `You beat ${beat.join(', ')} on this seed.` : 'The models are ahead on this seed. Try again.'}</p>
        <div className="row">
          <button type="button" className="btn" onClick={onAgain}>Play again</button>
          <button type="button" className="btn ghost" onClick={copy}>Copy result link</button>
          <Link to={`/run/${res.runId}`} className="btn ghost">Replay your moves</Link>
        </div>
      </div>
    </>
  );
}

function Round({ seedCode, token, as, onBack, onForget }: { seedCode: string; token?: string; as: 'human' | 'agent'; onBack?: () => void; onForget?: () => void }) {
  const { game, seed } = parseSeedCode(seedCode)!, [n, again] = useReducer((k: number) => k + 1, 0);
  const [log, setLog] = useState<string[]>(), [res, setRes] = useState<VerifyRes>(), [err, setErr] = useState(''), [msg, say] = useToast();
  useEffect(() => { track(`play_start:${game}`); }, [game, n]);
  const submit = (actions: string[]) => {
    setLog(actions); setErr('');
    api.verify({ game, seedCode, actions, as }, token).then((r) => { setRes(r); track(`play_finish:${game}`); }, (e: Error) => setErr(e.message));
  };
  const restart = () => { setLog(undefined); setRes(undefined); setErr(''); again(); };
  return (
    <section className="panel">
      <h2>{GAMES[game].name} <span className="num" style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 400 }}>· seed {seedCode}</span></h2>
      {META[game].data && <p className="hint"><Credit id={META[game].data!} /></p>}
      <div className="stage">
        <Player key={n} game={game} seed={seed} onDone={submit} />
        <div className="side">
          <h3>Same seed, the models</h3>
          {!log && <p>Finish the game to see how you compare. Your moves are replayed on the server to check your score.</p>}
          {log && !res && !err && <p role="status">Checking your run…</p>}
          {err && <p className="err" role="alert">{err} <button type="button" className="btn ghost" onClick={() => submit(log!)}>Try again</button>{onForget && /token/i.test(err) && <button type="button" className="btn ghost" onClick={onForget}>Sign up again</button>}</p>}
          {res && <Result res={res} onAgain={restart} say={say} />}
          {onBack && <div className="row"><button type="button" className="btn ghost" onClick={onBack}>Pick another game</button></div>}
        </div>
      </div>
      <div className={`toast${msg ? ' on' : ''}`} role="status">{msg}</div>
    </section>
  );
}

export default function Play() {
  const q = new URLSearchParams(location.search), agent = q.get('as') === 'agent', link = q.get('link'), seedParam = q.get('seed');
  const fromSeed = seedParam ? parseSeedCode(seedParam) : null, slug = path().split('/')[2];
  const [token, setToken] = useState<string | null>(agent ? link : saved()), [picked, setPicked] = useState<string | null>(GAMES[slug] ? slug : null);
  const [daily, setDaily] = useState<Record<string, string>>(), [dailyErr, setDailyErr] = useState(''), [retry, again] = useReducer((k: number) => k + 1, 0);
  const needDaily = !!token && !fromSeed && !!picked;
  useEffect(() => { if (agent) track('agent_play'); }, [agent]);
  useEffect(() => {
    if (!needDaily) return;
    setDailyErr('');
    api.daily().then((d) => setDaily(d.seeds), (e: Error) => setDailyErr(e.message));
  }, [needDaily, retry]);

  const seedCode = seedParam && fromSeed ? seedParam : picked && daily?.[picked];
  const step = !token ? 1 : picked || fromSeed ? 3 : 2;
  return (
    <main>
      <Link to="/" className="back">Back to home</Link>
      <h1>{agent ? 'Play as a computer-use agent' : 'Test your human intelligence'}</h1>
      <p className="lede">{agent ? 'This run is scored on the computer-use track, with the same seeds and the same scale as every other entry.' : 'Play the exact seeds the models play and see where you land between the random player and the expert. Your score uses the same scale as theirs.'}</p>
      {!agent && <div className="steps" aria-label="Progress">{['Your details', 'Pick a game', 'Play'].map((s, i) => <span key={s} aria-current={step === i + 1 ? 'step' : undefined}><b>{i + 1}</b>{s}</span>)}</div>}
      {seedParam && !fromSeed && <p className="err" role="alert">That seed code is not valid for this version of the games.</p>}
      {agent && !link ? <p className="lede">Agents need their private link to play here. Get one on <Link to="/connect">Connect your AI</Link>.</p>
        : !token ? <Form onDone={(t) => { keep(t); setToken(t); }} />
        : seedCode ? <Round key={seedCode} seedCode={seedCode} token={token} as={agent ? 'agent' : 'human'} onBack={fromSeed ? undefined : () => setPicked(null)} onForget={agent ? undefined : () => { keep(null); setToken(null); }} />
        : picked ? (dailyErr ? <p className="err" role="alert">Today's seed is not available: {dailyErr} <button type="button" className="btn ghost" onClick={again}>Try again</button></p> : <p className="lede" role="status">Loading today's seed…</p>)
        : <Picker onPick={setPicked} />}
    </main>
  );
}
