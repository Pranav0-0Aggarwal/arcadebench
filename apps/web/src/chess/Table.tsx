import { useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import type { Color, LiveFrame, MatchLive, MatchView, SeatInfo, SeatOut } from '@arcadebench/api';
import { parse, Pos, san, START, uci } from '@arcadebench/engine';
import { ratio } from '@arcadebench/render';
import { Link } from '../components/Chrome.tsx';
import { watchPath } from '../components/Live.tsx';
import { useFlash, useLoad } from '../components/hooks.ts';
import { CONTROLS, type Host } from '../game/controls.ts';
import GameCanvas from '../game/GameCanvas.tsx';
import { api } from '../lib/api.ts';
import { navigate } from '../lib/router.ts';
import { useWatch } from '../lib/watch.ts';
import Invites from './Invites.tsx';
import { mmss, pairs, useNow } from './util.ts';

type Frame = LiveFrame & { match: MatchLive };
const MARK = ['', '?!', '?', '??'], TIER = ['', 'inaccuracy', 'mistake', 'blunder'], PILL = { open: 'Waiting', live: 'Live', done: 'Finished' };
const cap = (c: string) => c[0].toUpperCase() + c.slice(1);
const nameOf = (s: SeatInfo) => (s.kind === 'computer' || s.joined ? s.name ?? 'Player' : 'Waiting for a player');
const kindOf = (s: SeatInfo) => (s.kind === 'computer' ? `computer level ${s.level}` : s.kind === 'agent' ? 'AI agent' : 'human');
const pct = (a: number | null) => (a === null ? 'n/a' : `${Math.round(a)}%`);

export default function Table({ id, view, seat, invites }: { id: string; view: MatchView; seat?: string; invites: SeatOut[] }) {
  const { frame: f, state } = useWatch(view.watch);
  if (!f?.match) return state === 'gone' ? <><h1>Game not found</h1><p className="lede">This game has expired.</p></> : <p className="lede" role="status">Connecting to the game…</p>;
  return <Game id={id} view={view} f={f as Frame} seat={seat} invites={invites} />;
}

function Game({ id, view, f, seat, invites }: { id: string; view: MatchView; f: Frame; seat?: string; invites: SeatOut[] }) {
  const l = f.match, d = f.data as { fen: string; turn: 'w' | 'b' }, me: Color | undefined = seat ? view.you : undefined, mine = me === 'black' ? 'b' : 'w';
  const opp: Color | undefined = me && (me === 'white' ? 'black' : 'white'), turn: Color = d.turn === 'w' ? 'white' : 'black', done = l.status === 'done', live = l.status === 'live';
  const [msg, flash, copy] = useFlash(), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [sure, setSure] = useState(false), [, bump] = useReducer((n: number) => n + 1, 0);
  const ctl = useState(CONTROLS.chess)[0], cur = useRef(''), list = useRef<HTMLOListElement>(null), now = useNow(live);
  const run = useLoad(() => (f.runId ? api.run(f.runId) : Promise.resolve(undefined)), [f.runId]).data;

  const data = useMemo(() => ({ ...d, you: mine }), [d, mine]);
  const legal = useMemo(() => (me && live && d.turn === mine ? Pos.fen(d.fen).legal().map(uci) : []), [d.fen, d.turn, live, mine, me]);
  const host: Host = {
    get legal() { return busy ? [] : legal; }, data,
    get cursor() { return cur.current; },
    set(c) { cur.current = c; bump(); },
    play(m) { setBusy(true); setErr(''); api.chess.move(id, seat!, m).catch((e: Error) => { setErr(e.message); setBusy(false); }); },
  };
  const active = host.legal.length > 0;
  useEffect(() => setBusy(false), [d.fen]);
  useEffect(() => { if (legal.length) { cur.current = ctl.sync!(legal, cur.current); bump(); } }, [d.fen, legal.length > 0]);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [l.sans.length]);
  useEffect(() => { if (!sure) return; const h = setTimeout(() => setSure(false), 4000); return () => clearTimeout(h); }, [sure]);

  const key = (e: KeyboardEvent) => { if (!active || e.metaKey || e.ctrlKey || e.altKey) return; if (ctl.down(e.key.length === 1 ? e.key.toLowerCase() : e.key, host)) e.preventDefault(); };
  const hit = (sq: string, how: '' | 'click' | 'alt' | 'up') => { cur.current = sq; if (how) ctl.down(how === 'alt' ? 'Backspace' : how === 'up' ? 'Release' : 'Enter', host); else bump(); };
  const act = (p: Promise<{ match: MatchView }>, declined = false) => { setErr(''); p.then((r) => { if (declined && r.match.status === 'live') flash('The computer declined the draw'); }, (e: Error) => setErr(e.message)); };
  const resign = () => { if (!sure) return setSure(true); setSure(false); act(api.chess.resign(id, seat!)); };

  const idx = me === 'black' ? 1 : 0, mineElo = run?.match?.elo[idx];
  const win = l.result === '1/2-1/2' ? 'Draw' : me ? ((l.result === '1-0') === (me === 'white') ? 'You won' : 'You lost') : l.result === '1-0' ? 'White wins' : 'Black wins';
  const text = done ? `${win} · ${l.why}` : l.status === 'open' ? 'Waiting for a player to join' : `${me ? (turn === me ? 'Your move' : `Waiting for ${nameOf(l[turn])}`) : `${cap(turn)} to move`}${l.draw ? `. ${cap(l.draw)} offers a draw` : ''}`;
  const bests = useMemo(() => {
    if (!run?.actions) return [];
    const p = Pos.fen(START);
    return run.actions.map((m, i) => { const g = l.grades[i], x = g?.tier ? san(p, parse(p, g.best)) : ''; p.make(parse(p, m)); return x; });
  }, [run, l.grades]);
  const open = invites.filter((s) => !l[s.color].joined);

  const row = (c: Color, i: number) => {
    const s = l[c], e = run?.match?.elo[i], mark = turn === c && live;
    return (
      <li key={c} className={`ch-seat${mark ? ' turn' : ''}`}>
        <i className={`ch-chip ${c}`} aria-hidden="true" />
        <div className="ch-who"><b>{nameOf(s)}{me === c && ' (you)'}</b>{s.x && !nameOf(s).includes(s.x) && <span> @{s.x}</span>}<span className="tag">{kindOf(s)}</span></div>
        <div className="num">{e ? `${e.before} → ${e.after}` : s.elo !== null ? `Elo ${s.elo}` : 'unrated'} · accuracy {pct(l.accuracy[i])}</div>
        {mark && l.deadline && <div className={`num ch-clock${Date.parse(l.deadline) - now < 60_000 ? ' low' : ''}`} role="timer" aria-label="Time left to move">{mmss(Date.parse(l.deadline) - now)}</div>}
      </li>
    );
  };

  return (
    <>
      <div className="wtitle"><h1>Chess</h1><span className={`pill ${live ? 'live' : ''}`}>{live && <i aria-hidden="true" />}{PILL[l.status]}</span></div>
      <p className="ch-status" role="status" aria-live="polite">{text}</p>
      {l.status === 'open' && open.length > 0 && <Invites id={id} seats={open} copy={copy} />}
      {l.status === 'open' && !open.length && <p className="hint">{!l.white.joined && !l.black.joined ? 'Both seats are open.' : `The ${l.white.joined ? 'black' : 'white'} seat is open.`} Someone with the invite link can take it.</p>}
      <div className="watch-grid" style={{ ['--r' as string]: ratio('chess') }}>
        <div className="wboard">
          <div className="board" style={{ ['--r' as string]: ratio('chess') }} tabIndex={me ? 0 : undefined} role="group" aria-label={`Chess board, ${mine === 'b' ? 'black' : 'white'} at the bottom. ${l.sans.length ? `Last move ${l.sans.at(-1)}.` : 'No moves yet.'}`} aria-describedby={me ? 'chess-keys' : undefined} onKeyDown={key}>
            <GameCanvas game="chess" data={data} label={`Chess position. ${cap(turn)} to move.`} intent={active ? cur.current : undefined} marks={active ? ctl.marks!(host) : undefined} onHit={active ? hit : undefined} />
          </div>
          {me && live && <p className="keys" id="chess-keys">{ctl.hint}</p>}
          {err && <p className="err" role="alert">{err}</p>}
        </div>
        <div className="wside">
          <ul className="ch-seats" aria-label="Players">{row('white', 0)}{row('black', 1)}</ul>
          <h3 className="ch-h">Moves</h3>
          <ol className="ch-moves" ref={list} aria-label="Moves">
            {pairs(l.sans.length).map((p, i) => (
              <li key={i}><span className="num">{i + 1}.</span>{p.map((n) => {
                const t = l.grades[n]?.tier ?? 0;
                return <span key={n} className={`ch-mv t${t}${n === l.sans.length - 1 ? ' now' : ''}`} title={t ? TIER[t] : undefined}>{l.sans[n]}{MARK[t]}{done && bests[n] && <small>best {bests[n]}</small>}{t > 0 && <span className="sr"> ({TIER[t]})</span>}</span>;
              })}</li>
            ))}
            {!l.sans.length && <li className="hint">No moves yet.</li>}
          </ol>
          {me && live && (
            <div className="row ch-acts">
              {l.draw === opp
                ? <><span className="hint">Your opponent offers a draw.</span><button type="button" className="btn" onClick={() => act(api.chess.draw(id, seat!, 'accept'))}>Accept</button><button type="button" className="btn ghost" onClick={() => act(api.chess.draw(id, seat!, 'decline'))}>Decline</button></>
                : <button type="button" className="btn ghost" disabled={l.draw === me} onClick={() => act(api.chess.draw(id, seat!, 'offer'), l[opp!].kind === 'computer')}>{l.draw === me ? 'Draw offered' : 'Offer draw'}</button>}
              <button type="button" className={`btn ghost${sure ? ' ch-sure' : ''}`} onClick={resign} onBlur={() => setSure(false)}>{sure ? 'Confirm resign' : 'Resign'}</button>
            </div>
          )}
          {done && (
            <div className="result">
              <div className="big">{win}</div>
              <p>{cap(l.why)}.{me && mineElo && <> Rating <b className="num">{mineElo.before} → {mineElo.after}</b> ({mineElo.after - mineElo.before >= 0 ? '+' : ''}{mineElo.after - mineElo.before}).</>}{me && run && !mineElo && ' This game was not rated.'}</p>
              <div className="row">
                {f.runId ? <Link to={`/run/${f.runId}`} className="btn">See the full review</Link> : <span className="hint" role="status">Scoring the last moves…</span>}
                <button type="button" className="btn ghost" onClick={() => navigate('/chess')}>Play again</button>
              </div>
            </div>
          )}
          <div className="callout ch-share">
            <b>Watch live link</b>
            <div className="linkbox"><code>{view.watchUrl}</code></div>
            <div className="share"><button type="button" onClick={() => copy(view.watchUrl, 'Watch link copied')}>Copy link</button><Link to={watchPath(view.watch)}>Open the watch page for clips</Link></div>
          </div>
        </div>
      </div>
      <div className={`toast${msg ? ' on' : ''}`} role="status">{msg}</div>
    </>
  );
}
