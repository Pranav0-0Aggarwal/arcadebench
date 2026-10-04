import { useEffect, useState, type FormEvent } from 'react';
import type { RunRes } from '@arcadebench/api';
import { GAMES, parseSeedCode, seedCodeOf } from '@arcadebench/engine';
import { GROUPS } from '../components/games.ts';
import { Link } from '../components/Chrome.tsx';
import LiveNow from '../components/Live.tsx';
import AutoPlay from '../game/AutoPlay.tsx';
import Replay from '../game/Replay.tsx';
import { api } from '../lib/api.ts';
import { track } from '../lib/track.ts';
import './pages.css';

const SPEEDS = [1, 2, 4];

export default function Arena() {
  const q = new URLSearchParams(location.search), first = parseSeedCode(q.get('seed') ?? '');
  const [game, setGame] = useState(first?.game ?? (GAMES[q.get('game') ?? ''] ? q.get('game')! : 'tetris')), [code, setCode] = useState<string | null>(first ? q.get('seed') : null);
  const [daily, setDaily] = useState<Record<string, string>>({}), [runs, setRuns] = useState<RunRes[]>([]), [id, setId] = useState(''), [err, setErr] = useState('');
  const [speed, setSpeed] = useState(1), [n, restart] = useState(0);

  const add = (raw: string) => {
    const rid = raw.trim().split('?')[0].split('/').filter(Boolean).pop();
    if (!rid) return;
    api.run(rid).then((r) => { setRuns((p) => [...p.filter((x) => x.id !== r.id), r]); setGame(r.game); setCode(r.seedCode); setErr(''); }, (e: Error) => setErr(e.message));
  };
  useEffect(() => {
    api.daily().then((d) => setDaily(d.seeds), () => setDaily({}));
    q.get('runs')?.split(',').forEach(add);
  }, []);

  const text = code ?? daily[game] ?? seedCodeOf(game, 1), p = parseSeedCode(text), canon = p && seedCodeOf(p.game, p.seed), shown = runs.filter((r) => r.seedCode === canon);
  const pickSeed = (v: string | null, g = game) => { track('arena_seed'); setCode(v); const s = v && parseSeedCode(v); setGame(s ? s.game : g); };
  const addRun = (e: FormEvent) => { e.preventDefault(); add(id); setId(''); };

  return (
    <main>
      <h1>Arena</h1>
      <p className="lede">Watch the expert and a random player take the same seed side by side, then add recorded runs to see where they lost ground.</p>
      <LiveNow compact together />
      <div className="panel arena-bar">
        <div className="field"><label htmlFor="a-game">Game</label><div className="in"><select id="a-game" value={game} onChange={(e) => pickSeed(null, e.target.value)}>{GROUPS.map(([label, games]) => <optgroup key={label} label={label}>{games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</optgroup>)}</select></div></div>
        <div className="field seed">
          <label htmlFor="a-seed">Seed code</label>
          <div className="in"><input id="a-seed" className="num" value={text} spellCheck={false} aria-invalid={!p} onChange={(e) => pickSeed(e.target.value)} /></div>
          {!p && <span className="err" role="alert">Not a valid seed code for these games.</span>}
        </div>
        <button type="button" className="btn ghost" onClick={() => pickSeed(null)}>Today's seed</button>
        <div className="speed" role="group" aria-label="Speed">{SPEEDS.map((s) => <button key={s} type="button" className="btn ghost" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}</div>
        <button type="button" className="btn ghost" onClick={() => restart(n + 1)}>Restart</button>
      </div>
      {p && (
        <div className="arena-grid">
          {(['expert', 'random'] as const).map((policy) => <section key={policy}><h3>{policy === 'expert' ? 'Expert' : 'Random'}</h3><AutoPlay key={`${policy}${n}`} game={p.game} seed={p.seed} policy={policy} speed={speed} /></section>)}
        </div>
      )}
      <section className="panel">
        <h2>Recorded runs</h2>
        <form className="arena-bar" onSubmit={addRun} style={{ marginTop: 14 }}>
          <div className="field seed"><label htmlFor="a-run">Run link or id</label><div className="in"><input id="a-run" value={id} onChange={(e) => setId(e.target.value)} placeholder="Paste a run link" /></div></div>
          <button type="submit" className="btn" disabled={!id.trim()}>Add run</button>
        </form>
        {err && <p className="err" role="alert" style={{ marginTop: 12 }}>{err}</p>}
        {p && shown.length === 0 && <p className="lede">No recorded run is loaded for this seed. Paste a run link to watch it next to the expert.</p>}
        <div className="runs">
          {p && shown.map((r) => (
            <div key={r.id}>
              <h3>{r.entry.name} <span className="num">score {r.score}</span></h3>
              <p className="who"><Link to={`/run/${r.id}`}>Open the run</Link></p>
              <Replay game={r.game} seed={p.seed} actions={r.actions} decisions={r.decisions} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
