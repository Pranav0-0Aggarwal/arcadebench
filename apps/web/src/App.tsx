import { lazy, Suspense } from 'react';
import { Footer, Header } from './components/Chrome.tsx';
import { usePath } from './lib/router.ts';

const Home = lazy(() => import('./pages/Home.tsx')), Leaderboard = lazy(() => import('./pages/Leaderboard.tsx')), Arena = lazy(() => import('./pages/Arena.tsx')),
  Run = lazy(() => import('./pages/Run.tsx')), Connect = lazy(() => import('./pages/Connect.tsx')), Play = lazy(() => import('./pages/Play.tsx')),
  Methodology = lazy(() => import('./pages/Methodology.tsx')), Chess = lazy(() => import('./pages/Chess.tsx')), Watch = lazy(() => import('./pages/Watch.tsx')), NotFound = lazy(() => import('./pages/NotFound.tsx'));

/** routes: / /leaderboard /arena /run/:id /watch/:watch /chess /chess/:match /connect /play /play/:game /methodology */
export default function App() {
  const p = usePath();
  const top = '/' + (p.split('/')[1] ?? '');
  const page = p === '/' ? <Home /> : top === '/leaderboard' ? <Leaderboard /> : top === '/arena' ? <Arena /> : top === '/run' ? <Run /> : top === '/watch' ? <Watch /> : top === '/connect' ? <Connect /> : top === '/play' ? <Play /> : top === '/chess' ? <Chess /> : top === '/methodology' ? <Methodology /> : <NotFound />;
  return (
    <div className="wrap">
      <Header current={top === '/' ? '/' : top} />
      <Suspense fallback={<p className="lede">Loading…</p>}>{page}</Suspense>
      <Footer />
    </div>
  );
}
