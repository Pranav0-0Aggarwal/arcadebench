import { useEffect, useState } from 'react';
import type { Color, QueueRes } from '@arcadebench/api';
import { Field } from '../components/Form.tsx';
import { api, HttpError } from '../lib/api.ts';
import { navigate } from '../lib/router.ts';
import { Levels } from './Create.tsx';
import { entry, keep, mmss, ticket, useNow } from './util.ts';

type Wait = Pick<QueueRes, 'ticket' | 'expires' | 'fallback'>;

export default function Queue() {
  const [color, setColor] = useState<Color | 'any'>('any'), [fall, setFall] = useState(false), [level, setLevel] = useState(3), [after, setAfter] = useState(30), [name, setName] = useState('');
  const [wait, setWait] = useState<Wait | null>(() => { const t = ticket.get(); return t === null ? null : { ticket: t, expires: '' }; }), [err, setErr] = useState(''), [gone, setGone] = useState(false), [busy, setBusy] = useState(false);
  const token = entry(), now = useNow(!!wait);

  const found = (r: QueueRes) => { ticket.set(null); keep(r.match!.match.id, { seat: r.match!.token }); navigate(`/chess/${r.match!.match.id}`); };
  const seen = (r: QueueRes) => { if (r.status === 'matched') found(r); else setWait({ ticket: r.ticket, expires: r.expires, fallback: r.fallback }); };

  useEffect(() => {
    if (!wait) return;
    let live = true, h = 0;
    const poll = () => api.chess.waiting(wait.ticket, token).then((r) => { if (live) { seen(r); h = window.setTimeout(poll, 2000); } }, (e: Error) => {
      if (!live) return;
      if (e instanceof HttpError && e.status === 404) { ticket.set(null); setWait(null); setGone(true); } else { setErr(e.message); h = window.setTimeout(poll, 2000); }
    });
    poll();
    return () => { live = false; clearTimeout(h); };
  }, [wait?.ticket]);

  const join = async () => {
    setBusy(true); setErr(''); setGone(false);
    try {
      const r = await api.chess.queue({ color, ...(fall && { computer: { level, after: Math.max(5, Math.min(600, after || 5)) } }), ...(name.trim() && { name: name.trim() }) }, token);
      if (r.ticket) ticket.set(r.ticket);
      seen(r);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const cancel = () => { api.chess.leave(wait!.ticket).catch(() => {}); ticket.set(null); setWait(null); };

  if (wait) {
    const at = Date.parse(wait.fallback ?? wait.expires);
    return (
      <section className="panel" aria-labelledby="q-h">
        <h2 id="q-h">Find an opponent</h2>
        <p role="status">Looking for an opponent{at ? <>. {wait.fallback ? 'The computer joins in' : 'This search ends in'} <b className="num">{mmss(at - now)}</b></> : '…'}</p>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row"><button type="button" className="btn ghost" onClick={cancel}>Cancel</button></div>
      </section>
    );
  }
  return (
    <section className="panel form" aria-labelledby="q-h">
      <h2 id="q-h" style={{ gridColumn: '1/-1' }}>Find an opponent</h2>
      <Field id="qc" label="Your colour"><select id="qc" value={color} onChange={(e) => setColor(e.target.value as Color | 'any')}><option value="any">Any</option><option value="white">White</option><option value="black">Black</option></select></Field>
      {!token && <Field id="qn" label={<>Display name <small>(optional)</small></>}><input id="qn" value={name} maxLength={24} autoComplete="nickname" placeholder="Guest" onChange={(e) => setName(e.target.value)} /></Field>}
      <fieldset>
        <label className="opt"><input type="checkbox" checked={fall} onChange={(e) => setFall(e.target.checked)} /><div><b>Or play the computer</b><span>If nobody joins in time, you play the computer.</span></div></label>
        {fall && <Levels id="ql" value={level} onChange={setLevel} />}
        {fall && <Field id="qa" label="After (seconds)" hint="5 to 600"><input id="qa" type="number" min={5} max={600} value={after} onChange={(e) => setAfter(+e.target.value)} /></Field>}
      </fieldset>
      <div className="go">
        <button type="button" className="btn" disabled={busy} onClick={join}>{gone ? 'Try again' : 'Find an opponent'}</button>
        {gone && <p className="err" role="alert">Your search expired. Try again.</p>}
        {err && <p className="err" role="alert">{err}</p>}
      </div>
    </section>
  );
}
