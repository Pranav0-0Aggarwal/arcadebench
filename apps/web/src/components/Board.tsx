import type { CSSProperties } from 'react';
import type { BoardRow } from '@arcadebench/api';
import { axis, KIND, tone } from './board.ts';
import { Link } from './Chrome.tsx';
import { f2 } from './format.ts';

const vars = (o: Record<string, string>) => o as CSSProperties;
const pct = (f: number) => `${(Math.min(1, Math.max(0, f)) * 100).toFixed(2)}%`;

function Meta({ r, tied }: { r: BoardRow; tied: number }) {
  const bits = [`${r.seeds} seeds`, r.agreement !== null && `${Math.round(r.agreement * 100)}% match the expert`, r.retestSpread !== null && `retest ±${f2(r.retestSpread)}`].filter(Boolean);
  return (
    <small className="num meta">
      {bits.join(' · ')}
      {r.averaged && <span className="tag">averaged, high variance</span>}
      {tied > 1 && <span className="tag">tied with {tied - 1} other{tied > 2 ? 's' : ''}</span>}
    </small>
  );
}

export default function Board({ rows }: { rows: BoardRow[] }) {
  const at = axis(rows);
  return (
    <ol className="lb" style={vars({ '--z': pct(at(0)), '--e': pct(at(1)) })}>
      <li className="lrow lhead num" aria-hidden="true"><span>rank</span><span>entrant</span><div className="axis"><span className="z">0 random</span><span className="e">1.0 expert</span></div><span className="val">score</span></li>
      {rows.map((r, i) => {
        const c = tone(r), base = r.badge === 'official', tied = rows.filter((o) => o.group === r.group).length;
        return (
          <li key={`${r.entryId}-${r.track}-${r.help}`} className={`lrow${i && rows[i - 1].group !== r.group ? ' gstart' : ''}`}>
            <span className="rank num"><span className="sr">rank </span>{r.rank[0] === r.rank[1] ? r.rank[0] : `${r.rank[0]}–${r.rank[1]}`}</span>
            <div className="ent">
              <b><Link to={`/leaderboard/${r.entryId}`}>{r.name}</Link></b>
              <small>{base ? 'official baseline' : `${KIND[r.agentType ?? 'other']}${r.help === undefined ? '' : ` · L${r.help}`} · registered`}{r.x && <> · <a href={`https://x.com/${r.x}`} rel="noopener noreferrer">@{r.x}</a></>}</small>
              <Meta r={r} tied={tied} />
            </div>
            <div className="ciplot" aria-hidden="true" style={vars({ '--c': c, '--lo': pct(at(r.lo)), '--hi': pct(at(r.hi)), '--v': pct(at(r.iqm)) })}><i className="band" /><i className="dot" /></div>
            <div className="val"><b>{f2(r.iqm)}</b><span className="num">{r.lo === r.hi ? 'baseline' : <><span className="sr">95% interval </span>{f2(r.lo)}–{f2(r.hi)}</>}</span></div>
          </li>
        );
      })}
    </ol>
  );
}
