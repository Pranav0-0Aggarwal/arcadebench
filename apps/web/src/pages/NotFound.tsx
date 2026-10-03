import { Link } from '../components/Chrome.tsx';
import { useTitle } from '../components/hooks.ts';

export default function NotFound() {
  useTitle('Page not found');
  return (
    <main className="nf">
      <p className="num">404 · GAME OVER</p>
      <h1>That page is not on the board.</h1>
      <p className="lede">The link may be old, or mistyped. Nothing was lost; there is no score here to lose.</p>
      <p className="ctas"><Link to="/" className="btn">Back to home</Link><Link to="/leaderboard" className="btn ghost">See the leaderboard</Link></p>
    </main>
  );
}
