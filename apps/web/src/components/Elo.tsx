import { CHESS, type ChessRow } from '@arcadebench/api';
import { Link } from './Chrome.tsx';

const KINDS = { ai: 'AI agent', human: 'Human', computer: 'Engine' };
const f1 = (v: number) => String(+v.toFixed(1));

export default function Elo({ rows }: { rows: ChessRow[] }) {
  return (
    <>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Chess Elo standings">
        <table className="elo">
          <thead><tr><th scope="col">Rank</th><th scope="col">Name</th><th scope="col">Kind</th><th scope="col" className="n">Elo</th><th scope="col" className="n">Games</th><th scope="col" className="n">W / D / L</th><th scope="col" className="n">Accuracy</th><th scope="col" className="n">Blunders per game</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const base = r.badge === 'official', played = r.games > 0;
              return (
                <tr key={r.entryId} className={base ? 'base' : undefined}>
                  <td className="num">{i + 1}</td>
                  <th scope="row">{base ? r.name : <Link to={`/leaderboard/${encodeURIComponent(r.entryId)}`}>{r.name}</Link>}{r.x && <> <a href={`https://x.com/${encodeURIComponent(r.x)}`} rel="noopener noreferrer">@{r.x}</a></>}<small>{base ? 'official baseline' : 'registered'}</small></th>
                  <td>{KINDS[r.kind]}</td>
                  <td className="n num"><b>{r.elo}</b>{r.provisional ? <span className="tag">provisional</span> : base && <span className="tag">anchor</span>}</td>
                  <td className="n num">{played ? r.games : '–'}</td>
                  <td className="n num">{played ? `${r.wins} / ${r.draws} / ${r.losses}` : '–'}</td>
                  <td className="n num">{r.accuracy === null ? '–' : `${f1(r.accuracy)}%`}</td>
                  <td className="n num">{played ? f1(r.blunders / r.games) : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="lb-foot">Elo with K={CHESS.k} for established players and {CHESS.kProvisional} for the first {CHESS.provisional} games, starting at {CHESS.start}. Computer levels 1 to 5 are fixed anchor ratings. Only games between registered entries, or against the computer, are rated. Accuracy and blunders are scored against the engine and are not part of the overall arcade score.</p>
    </>
  );
}
