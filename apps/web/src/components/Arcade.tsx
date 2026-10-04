import { CLASSICS, LAB, ORIGINALS, parseSeedCode, seedCodeOf } from '@arcadebench/engine';
import AutoPlay from '../game/AutoPlay.tsx';
import Block from './Block.tsx';
import { Link } from './Chrome.tsx';
import { META } from './games.ts';
import { daily, useLoad } from './hooks.ts';
import InView from './InView.tsx';

const FALLBACK = 417;

function useSeeds() {
  const { data } = useLoad(daily, []);
  return (game: string) => {
    const code = data?.seeds[game] ?? seedCodeOf(game, FALLBACK);
    return { code, seed: parseSeedCode(code)?.seed ?? FALLBACK };
  };
}

export function Arcade({ paused }: { paused: boolean }) {
  const { code, seed } = useSeeds()('tetris'), speed = paused ? 0 : 1;
  return (
    <Block id="arcade" title="Arcade: same seed, every agent, every move" sub="In the games, each run becomes a track of per-move regret against the expert. The two official baselines play today's Tetris seed below; models and people join them as benchmark runs land.">
      <div className="session">
        {([['expert', 'Expert', 'official reference'], ['random', 'Random', 'official floor']] as const).map(([policy, name, note]) => (
          <figure className="monitor" key={policy}>
            <div className="board"><AutoPlay game="tetris" seed={seed} policy={policy} speed={speed} className="ap" /></div>
            <figcaption><b>{name}</b><span>{note}</span><span className="num">seed {code}</span></figcaption>
          </figure>
        ))}
        <div className="watch">
          <p>Each bar in a run's track is one move, and its height is how much worse it was than the expert's choice. Open a run to see where an agent lost ground.</p>
          <Link to="/play/tetris" className="playseed">Play this seed yourself</Link>
          <Link to="/arena" className="playseed">Open the Arena</Link>
        </div>
      </div>
    </Block>
  );
}

export function Games({ paused }: { paused: boolean }) {
  const seeds = useSeeds(), speed = paused ? 0 : 1;
  const tiles = (games: typeof CLASSICS, cls = '') => (
    <div className={`games ${cls}`}>
      {games.map((g) => {
        const m = META[g.id], { code, seed } = seeds(g.id);
        return (
          <div className="game" key={g.id}>
            <InView className="screen"><AutoPlay game={g.id} seed={seed} policy="expert" speed={speed} className="ap" /></InView>
            <div>
              <b>{g.name}<span className="num">{m.cap}</span></b>
              <span className="meta"><span>{m.skills}</span><span className="num">{code}</span></span>
            </div>
          </div>
        );
      })}
    </div>
  );
  return (
    <Block id="games" title="Eleven games and three Decision Lab tasks, chosen to test different abilities" sub="Planning, spatial reasoning, timing, risk, adversarial play and logic. The two runners are real-time and are scored on a latency clock and a token clock.">
      {tiles(CLASSICS)}
      <h3 className="orig-h">ArcadeBench originals</h3>
      <p className="sub orig-p">Invented for this benchmark, so no model has seen them in training. Shifting Rules changes its hidden rules on every seed.</p>
      {tiles(ORIGINALS, 'origs')}
      <h3 className="orig-h">Decision Lab</h3>
      <p className="sub orig-p">Three one-decision-per-item tasks built on open datasets: sort a text message, pick the function for a request, flag a fraudulent payment. Each is 300 items scored against the dataset label, with a board of its own.</p>
      {tiles(LAB, 'origs')}
    </Block>
  );
}
