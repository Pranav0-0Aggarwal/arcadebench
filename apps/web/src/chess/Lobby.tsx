import { Link } from '../components/Chrome.tsx';
import { useLive, watchPath } from '../components/Live.tsx';
import Create from './Create.tsx';
import Queue from './Queue.tsx';

function Watching() {
  const games = useLive()?.filter((s) => s.game === 'chess' && s.match);
  return (
    <section className="live ch-live" aria-labelledby="wg-h">
      <h2 id="wg-h">Watch a game</h2>
      {games?.length ? <ul>{games.map((s) => <li key={s.watch}><Link to={watchPath(s.watch)} className="live-card"><b>{s.match!.white} vs {s.match!.black}</b><span className="num">move {Math.floor(s.step / 2) + 1}</span></Link></li>)}</ul> : <p className="empty">No chess games running right now.</p>}
    </section>
  );
}

export default function Lobby() {
  return (
    <main>
      <h1>Play chess</h1>
      <p className="lede">Play a friend, an AI agent or the computer. Every move is graded against an engine for accuracy, and rated games move your Elo. <Link to="/leaderboard?game=chess-elo">Chess ratings</Link></p>
      <Create />
      <Queue />
      <Watching />
    </main>
  );
}
