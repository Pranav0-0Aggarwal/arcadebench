import { useState } from 'react';
import { LEVELS } from '@arcadebench/engine';
import { Link } from '../components/Chrome.tsx';
import { Field, Opt } from '../components/Form.tsx';
import { api } from '../lib/api.ts';
import { navigate } from '../lib/router.ts';
import { entry, keep, request, type Slot } from './util.ts';

const KINDS: [Slot['kind'], string, string][] = [['me', 'Me', 'You play this colour.'], ['human', 'A friend', 'Send them an invite link.'], ['agent', 'An AI agent', 'Send it an invite and instructions.'], ['computer', 'Computer', 'Pick a level.']];

export function Levels({ id, value, onChange }: { id: string; value: number; onChange: (n: number) => void }) {
  return (
    <Field id={id} label="Computer level">
      <select id={id} value={value} onChange={(e) => onChange(+e.target.value)}>{LEVELS.map((l, i) => <option key={i} value={i + 1}>{`Level ${i + 1}, about ${l.elo} Elo`}</option>)}</select>
    </Field>
  );
}

function Side({ color, slot, set }: { color: string; slot: Slot; set: (s: Slot) => void }) {
  return (
    <fieldset className="ch-side">
      <legend>{color}</legend>
      {KINDS.map(([kind, title, text]) => <Opt key={kind} title={title} name={`c-${color}`} checked={slot.kind === kind} onChange={() => set({ ...slot, kind })}>{text}</Opt>)}
      {slot.kind === 'computer' && <Levels id={`lv-${color}`} value={slot.level} onChange={(level) => set({ ...slot, level })} />}
    </fieldset>
  );
}

export default function Create() {
  const [white, setWhite] = useState<Slot>({ kind: 'me', level: 3 }), [black, setBlack] = useState<Slot>({ kind: 'computer', level: 3 }), [name, setName] = useState('');
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), token = entry();
  const pick = (other: Slot, setMine: (s: Slot) => void, setOther: (s: Slot) => void) => (s: Slot) => { setMine(s); if (s.kind === 'me' && other.kind === 'me') setOther({ ...other, kind: 'human' }); };
  const go = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.chess.create(request(white, black, name.trim() || undefined), token);
      keep(r.match.id, { seat: r.token, invites: r.seats.filter((s) => s.token) });
      navigate(`/chess/${r.match.id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <section className="panel form" aria-labelledby="new-h">
      <h2 id="new-h" style={{ gridColumn: '1/-1' }}>Choose White and Black</h2>
      <Side color="White" slot={white} set={pick(black, setWhite, setBlack)} />
      <Side color="Black" slot={black} set={pick(white, setBlack, setWhite)} />
      {!token && <Field id="cn" label={<>Display name <small>(optional)</small></>} hint="Shown to your opponent. You are a guest."><input id="cn" value={name} maxLength={24} autoComplete="nickname" placeholder="Guest" onChange={(e) => setName(e.target.value)} /></Field>}
      <div className="go">
        <button type="button" className="btn" disabled={busy} onClick={go}>Create game</button>
        <p>{token ? 'You are signed in, so a game is rated when every player is registered.' : <>Guests play unrated games. Rated games need every human registered: <Link to="/play">sign up on Play</Link>.</>}</p>
        {err && <p className="err" role="alert">{err}</p>}
      </div>
    </section>
  );
}
