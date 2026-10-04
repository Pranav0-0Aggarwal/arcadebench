import { Fragment, useEffect, useState } from 'react';
import type { MatchLive, MatchRecord, MoveGrade } from '@arcadebench/api';
import { cap, kindOf, MARK, pct, say, seatName, TIER } from './match.ts';

const COLORS = ['white', 'black'] as const;

function Clock({ at }: { at: string }) {
  const [now, set] = useState(Date.now);
  useEffect(() => { const t = setInterval(() => set(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.round((Date.parse(at) - now) / 1000));
  return <span className="num">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
}

export function Status({ m }: { m: MatchLive }) {
  if (m.status === 'open') return <>Waiting for a player to join.</>;
  if (m.status === 'done') return <>{say(m)}</>;
  return <>{m.sans.length % 2 ? 'Black' : 'White'} to move{m.deadline && <> · <Clock at={m.deadline} /> on the clock</>}{m.draw && <> · {cap(m.draw)} offers a draw</>}</>;
}

export function Players({ m, rec }: { m: MatchLive; rec?: MatchRecord }) {
  return (
    <div className="seats">
      {COLORS.map((c, i) => {
        const s = m[c], e = rec?.elo[i], t = rec?.tiers[i];
        return (
          <div className="seat" key={c}>
            <span className={`sw ${c}`} aria-hidden="true" />
            <div>
              <b>{seatName(s)}</b>{s.x && s.name !== `@${s.x}` && <> <a href={`https://x.com/${encodeURIComponent(s.x)}`} rel="noopener noreferrer">@{s.x}</a></>}
              <small>{cap(c)} · {kindOf(s)} · {s.elo === null ? 'unrated' : `Elo ${s.elo}`}</small>
            </div>
            {s.kind !== 'computer' && <div className="stats">
              <div>accuracy<b>{pct(m.accuracy[i])}</b></div>
              {rec && <div>Elo change<b>{e ? `${e.before} → ${e.after}` : 'unrated'}</b></div>}
              {t && <div>inaccuracies, mistakes, blunders<b>{t.join(' · ')}</b></div>}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

const num = (v: number) => String(+v.toFixed(1));
export const note = (g: MoveGrade | null) => (g && g.tier ? `${TIER[g.tier]}: lost ${num(g.loss)} win-probability points` : undefined);

export function Moves({ sans, grades, at, seek }: { sans: string[]; grades: (MoveGrade | null)[]; at?: number; seek?: (i: number) => void }) {
  return (
    <p className="moves" aria-label="Moves">
      {sans.map((s, i) => {
        const g = grades[i], t = g?.tier ?? 0, cls = `mv t${t}`;
        return (
          <Fragment key={i}>
            {i % 2 === 0 && <span className="mn num">{i / 2 + 1}.</span>}
            {seek
              ? <button type="button" className={cls} title={note(g)} aria-current={at === i + 1 || undefined} onClick={() => seek(i + 1)}>{s}{MARK[t]}</button>
              : <span className={cls} title={note(g)}>{s}{MARK[t]}</span>}
          </Fragment>
        );
      })}
    </p>
  );
}
