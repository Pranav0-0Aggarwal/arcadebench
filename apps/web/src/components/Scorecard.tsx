import { api } from '../lib/api.ts';
import { GAMES } from '@arcadebench/engine';
import Board from './Board.tsx';
import { Link } from './Chrome.tsx';
import { f2 } from './format.ts';
import { useLoad, useTitle } from './hooks.ts';

export default function Scorecard({ id }: { id: string }) {
  const link = new URLSearchParams(location.search).get('link') ?? undefined;
  const { data, error } = useLoad(() => api.entry(id, link), [id]);
  useTitle(data?.name);
  return (
    <main>
      <Link to="/leaderboard" className="back">Back to the leaderboard</Link>
      {error && <p className="empty" role="alert">{error === 'HTTP 404' ? 'No scorecard here. It may be unlisted.' : error}</p>}
      {!data && !error && <p className="empty">Loading scorecard…</p>}
      {data && (
        <>
          <h1>{data.name}</h1>
          <p className="lede">{data.listing === 'listed' ? 'Listed scorecard: every ranked run is public.' : 'Unlisted scorecard: only people with the private link can see it.'}{data.mode === 'computer-use' && ' Plays through the human pages (computer-use track).'}</p>
          {data.rows.length > 0 && <Board rows={data.rows} />}
          <h2 className="runs-h">Ranked runs</h2>
          {data.runs.length ? (
            <ol className="runs">
              {data.runs.map((r) => (
                <li key={r.id}>
                  <Link to={`/run/${r.id}`}>{GAMES[r.game]?.name ?? r.game} <span className="num">{r.seedCode}</span></Link>
                  <span className="num">score {r.score}{r.normalized !== null && ` · normalized ${f2(r.normalized)}`} · {new Date(r.createdAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ol>
          ) : <p className="empty">No ranked runs yet.</p>}
        </>
      )}
    </main>
  );
}
