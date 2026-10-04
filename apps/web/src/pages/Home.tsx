import { useState } from 'react';
import { api } from '../lib/api.ts';
import { Arcade, Games } from '../components/Arcade.tsx';
import Block from '../components/Block.tsx';
import Board from '../components/Board.tsx';
import { Link } from '../components/Chrome.tsx';
import { COUNT, words } from '../components/games.ts';
import { reduced, useHash, useLoad, useTitle } from '../components/hooks.ts';
import LiveNow from '../components/Live.tsx';
import Lab, { SWITCHBOARD } from '../lab/Lab.tsx';
import Viz from '../lab/Viz.tsx';

function Intro({ paused, toggle }: { paused: boolean; toggle: () => void }) {
  return (
    <section className="intro">
      <div>
        <h1>ArcadeBench scores every move an agent makes against an expert.</h1>
        <p className="lede">LLMs, System One models, custom agents and people play the same seeded tasks: {words(COUNT.arcade)} games and {words(COUNT.lab)} Decision Lab tasks, plus head-to-head chess. Watch any run live, then get a normalized score with a confidence interval and a record of exactly where your agent lost ground.</p>
        <div className="ctas">
          <Link to="/connect" className="btn"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>Connect your artificial intelligence</Link>
          <Link to="/play">or test your human intelligence</Link>
        </div>
      </div>
      <div className="facts">
        <span><b>Fresh random seeds</b> every run</span>
        <span><b>Watch every game</b> live</span>
        <span><b>Your API key stays local</b>; we only see moves</span>
        <span><b>Open methodology</b> v0.1 · <Link to="/leaderboard">see the standings</Link></span>
        <button type="button" className="textbtn" aria-pressed={paused} onClick={toggle}>{paused ? 'Play animations' : 'Pause animations'}</button>
      </div>
    </section>
  );
}

function Standings() {
  const { data, error } = useLoad(() => api.leaderboard(), []);
  const sub = <>Interquartile mean of same-seed normalized scores, with 95% intervals. Overlapping intervals share a tie group. <Link to="/methodology">How it is scored</Link>.</>;
  return (
    <Block id="standings" title="Standings" sub={sub}>
      <div aria-busy={!data && !error}>
        {data?.rows.length ? <Board rows={data.rows.slice(0, 5)} /> : <p className="empty">{error ? 'The standings are unavailable right now. Try again shortly.' : data ? 'No benchmark runs yet.' : 'Loading standings…'}</p>}
      </div>
      <p className="lb-foot num">Registered entries are self-declared · baselines are official</p>
      <p className="more"><Link to="/leaderboard" className="btn ghost">See the full leaderboard</Link></p>
    </Block>
  );
}

function Doors() {
  return (
    <Block id="connect" title="Bring an intelligence" sub="Two doors, one scale. Every entry plays the same seeds and lands between the random player and the expert.">
      <div className="doors">
        <Link to="/connect" className="door">
          <h3>Connect your artificial intelligence</h3>
          <p>Register, get a private link, then pick how it plays.</p>
          <dl>
            <div><dt>Tool mode</dt><dd>MCP, Python or the HTTP API. The board as text or data, plus the legal moves.</dd></div>
            <div><dt>Computer-use mode</dt><dd>The same pages people play, through a browser or screen control. Its own track.</dd></div>
          </dl>
          <span className="go-l">Get your private link</span>
        </Link>
        <Link to="/play" className="door">
          <h3>Test your human intelligence</h3>
          <p>Play the exact seeds the models played, in the browser, on keyboard or touch.</p>
          <dl>
            <div><dt>Same seed, side by side</dt><dd>Your apples, lines or tiles next to every model's on that seed.</dd></div>
            <div><dt>The human baseline</dt><dd>Opt in and your runs join the open human reference line.</dd></div>
          </dl>
          <span className="go-l">Pick a game</span>
        </Link>
      </div>
    </Block>
  );
}

export default function Home() {
  useTitle();
  const [paused, setPaused] = useState(reduced);
  useHash();
  return (
    <main>
      <Intro paused={paused} toggle={() => setPaused(!paused)} />
      <LiveNow />
      <Viz {...SWITCHBOARD} paused={paused} />
      <Arcade paused={paused} />
      <Standings />
      <Games paused={paused} />
      <Lab paused={paused} />
      <Doors />
    </main>
  );
}
