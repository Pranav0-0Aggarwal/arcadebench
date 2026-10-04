import { useTitle } from '../components/hooks.ts';
import Lobby from '../chess/Lobby.tsx';
import Match from '../chess/Match.tsx';
import { usePath } from '../lib/router.ts';
import './pages.css';
import './chess.css';

export default function Chess() {
  const id = usePath().split('/')[2];
  useTitle('Chess');
  return id ? <Match key={id} id={decodeURIComponent(id)} /> : <Lobby />;
}
