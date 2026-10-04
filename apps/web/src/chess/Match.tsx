import { useEffect, useState } from 'react';
import type { MatchView } from '@arcadebench/api';
import { Link } from '../components/Chrome.tsx';
import { Field } from '../components/Form.tsx';
import { api, HttpError } from '../lib/api.ts';
import Table from './Table.tsx';
import { entry, fragment, keep, saved } from './util.ts';

export default function Match({ id }: { id: string }) {
  const [ses, setSes] = useState(() => saved(id)), [view, setView] = useState<MatchView>(), [err, setErr] = useState(''), [gone, setGone] = useState(false), [name, setName] = useState('');
  const [invite, setInvite] = useState(() => (ses.seat ? '' : fragment(location.hash))), token = entry();

  const join = async () => {
    setErr('');
    try {
      const r = await api.chess.join(id, invite, name.trim() || undefined, token);
      const s = { ...ses, seat: r.token };
      keep(id, s); setSes(s); setInvite('');
    } catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { if (token && invite) join(); }, []);
  useEffect(() => { if (!invite && location.hash) history.replaceState(null, '', location.pathname + location.search); }, [invite]);
  useEffect(() => {
    api.chess.match(id, ses.seat).then(setView, (e: Error) => {
      if (e instanceof HttpError && e.status === 403 && ses.seat) { const s = { ...ses, seat: undefined }; keep(id, s); setSes(s); }
      else if (e instanceof HttpError && e.status === 404) setGone(true);
      else setErr(e.message);
    });
  }, [id, ses.seat]);

  return (
    <main>
      <Link to="/chess" className="back">Back to chess</Link>
      {invite && !token && (
        <section className="panel form" aria-labelledby="j-h">
          <h2 id="j-h" style={{ gridColumn: '1/-1' }}>You are invited to play</h2>
          <Field id="jn" label={<>Display name <small>(optional)</small></>} hint="You join as a guest, so the game is unrated."><input id="jn" value={name} maxLength={24} autoComplete="nickname" placeholder="Guest" onChange={(e) => setName(e.target.value)} /></Field>
          <div className="go"><button type="button" className="btn" onClick={join}>Join the game</button></div>
        </section>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      {gone ? <><h1>Game not found</h1><p className="lede">This game does not exist or has expired. <Link to="/chess">Start a new one</Link>.</p></>
        : view ? <Table id={id} view={view} seat={ses.seat} invites={ses.invites ?? []} />
        : <p className="lede" role="status">Loading the game…</p>}
    </main>
  );
}
