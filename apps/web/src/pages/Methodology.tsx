import { GAMES, CLASSICS, ORIGINALS } from '@arcadebench/engine';
import { DATASETS } from '../components/datasets.ts';
import { META } from '../components/games.ts';
import { useHash, useTitle } from '../components/hooks.ts';

const TOC = [['games', 'Games and experts'], ['help', 'Help levels'], ['tracks', 'Tracks and clocks'], ['seeds', 'Seeds and integrity'], ['scoring', 'Normalization and regret'], ['aggregation', 'IQM, intervals and ties'], ['stability', 'Stability'], ['verified', 'Verified or declared'], ['lab', 'Decision Lab'], ['privacy', 'Privacy'], ['versions', 'Versioning']];

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => <section className="doc-s" id={id} aria-labelledby={`${id}-h`}><h2 id={`${id}-h`}>{title}</h2>{children}</section>;

function GameTable({ title, games }: { title: string; games: typeof CLASSICS }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={title}>
      <table>
        <caption>{title}</caption>
        <thead><tr><th scope="col">Game</th><th scope="col">Tests</th><th scope="col">Expert</th><th scope="col">Regret</th><th scope="col">Episode cap</th><th scope="col">Clock</th></tr></thead>
        <tbody>{games.map((g) => <tr key={g.id}><th scope="row">{g.name}</th><td>{META[g.id].skills}</td><td>{META[g.id].expert}</td><td>{g.valuesExact ? 'exact' : 'heuristic'}</td><td>{META[g.id].cap}</td><td>{g.realtime ? 'real-time' : 'turn-based'}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export default function Methodology() {
  useTitle('Methodology');
  useHash();
  return (
    <main className="doc">
      <h1>How ArcadeBench scores an agent</h1>
      <p className="lede">Methodology v0.1. Everything on the leaderboard is computed the way it is written here, and anything that is not verified by ArcadeBench says so.</p>
      <nav className="toc" aria-label="On this page"><ol>{TOC.map(([id, l]) => <li key={id}><a href={`#${id}`}>{l}</a></li>)}</ol></nav>

      <Section id="games" title="Games and experts">
        <p>Every game is a seeded, deterministic engine written once in TypeScript and used by both the browser and the server, with integer physics and random streams that do not depend on what the agent does. Each game ships a random baseline and an expert policy. The <b>expert</b> is the best policy we can build; where it is a heuristic rather than an exact solver, regret against it is a heuristic too, and the table says which.</p>
        <p><b>Exact</b> regret means the expert's value for every legal move is exact, in the game's own units. <b>Heuristic</b> regret means the values come from a search or evaluation that is strong but not provably optimal, so an agent can occasionally beat the expert (a normalized score above 1).</p>
        <GameTable title="Eight classics" games={CLASSICS} />
        <GameTable title="Three ArcadeBench originals, invented so no model has seen them in training" games={ORIGINALS} />
        <p className="note">Connect Four is played against engines of several strengths, Sokoban and Beam Router are graded multi-puzzle episodes, and no seed is all-or-nothing.</p>
      </Section>

      <Section id="help" title="Observation help levels">
        <p>How much the board is explained to the agent. Entries are only ever ranked against entries at the same level.</p>
        <dl>
          <div><dt>L0, raw</dt><dd>The board as text or a grid, and the legal actions by name.</dd></div>
          <div><dt>L1, features</dt><dd>L0 plus per-option features, such as holes, height and bumpiness after a Tetris placement.</dd></div>
          <div><dt>L2, outcomes</dt><dd>L1 plus the immediate result of each option: lines cleared, apple eaten, death. Games that hide information (Minesweeper, Shifting Rules) do not reveal outcomes at L2, because that would leak mines or hidden rules.</dd></div>
        </dl>
      </Section>

      <Section id="tracks" title="Tracks, clocks and divisions">
        <ul>
          <li><b>Turn-based:</b> the game waits for the agent.</li>
          <li><b>Real-time (Dino runner, Lane runner; Snake optionally):</b> two separately ranked clocks. On the <b>latency clock</b>, the server-measured reply time becomes elapsed 60 Hz frames, and a published default action applies when the agent is late; it depends on the entrant's network and hardware, and is labelled environment-dependent. On the <b>token clock</b>, each output token costs a fixed amount of game time; it is fully reproducible and LLM-only.</li>
          <li><b>Closed division:</b> the official, versioned and hashed prompt and harness. <b>Open division:</b> any custom scaffold, memory or tools.</li>
          <li><b>Computer-use track:</b> agents play the exact pages people play, from screenshots and clicks, through a browser API or OS-level screen control. It is ranked only against other computer-use entries, with screenshots and latency reported, and never counts toward the human baseline.</li>
        </ul>
        <p>Tracks, help levels and divisions are never pooled on one ranking.</p>
      </Section>

      <Section id="seeds" title="Seeds and integrity">
        <p>Every game, whether <b>practice</b> or <b>benchmark</b>, runs on a public seed, and every action log is re-simulated on our server, so client-reported scores are never trusted. A benchmark game runs only on our server, so every move is seen by ArcadeBench.</p>
        <ul>
          <li><b>Fresh public seeds per run.</b> Each benchmark run draws new random seeds and publishes them with the run, as seed codes.</li>
          <li><b>Seed codes.</b> Every game instance has a shareable code, <span className="num">TET-0417-K9F2</span> in form, that pins the game, the engine major version and the seed. The same code is the same game for every player.</li>
          <li><b>Same-seed normalization keeps runs comparable.</b> The random player and the expert play each seed too, so a hard or easy seed shifts all three together and cancels out of the score.</li>
          <li><b>Adaptive stopping and repeats.</b> A game stops early once at least 10 seeds give a 95% interval half-width of at most 0.05, otherwise it plays up to 30, and then it replays a few seeds as a repeat check.</li>
          <li><b>Every run is visible.</b> Listed scorecards show every run, and runs cannot be withdrawn. Each game stops once its interval is tight, so nobody can keep playing until they get lucky.</li>
          <li><b>Abandoned games count.</b> A game the agent stops playing (a crash, a closed connection, 30 idle minutes) is stored at the score it reached, like a forfeit, so quitting bad games cannot lift a score.</li>
          <li><b>Live watch pages.</b> Every game gets a watch link, so anyone can follow the board, the score and each move against the expert while it is played, and record a clip.</li>
          <li><b>Daily seed.</b> One public seed per game per day, played by people and models alike, on a practice board that is not rated.</li>
        </ul>
        <p className="note">The honest trade-off: there is no hidden test set, because seeds are public. Boards cannot be memorized, because every run draws fresh seeds, and instead of secrecy we rely on public seeds, server re-simulation and runs that anyone can replay.</p>
      </Section>

      <Section id="scoring" title="Normalization and regret">
        <p>The <b>normalized score</b> is (agent − random) / (expert − random), computed on the same seed, so the random player is 0 and the expert is 1. Values above 1 are allowed and are capped at 1.5 when aggregated. A seed where the expert cannot be separated from random is dropped, and the drop is counted.</p>
        <p><b>Move quality</b> is recorded per decision: whether the agent matched the expert, and its <b>regret</b>, how much worse its move was than the expert's, in the game's own units (lines in Tetris, tiles in 2048). Forced moves are excluded or down-weighted. Also reported: survival, raw game score, invalid-action rate, deadline-miss rate in real time, latency percentiles, and tokens and cost, which are self-reported and flagged as such. Calibration (Brier, ECE) is reported when an agent supplies probabilities.</p>
        <p>Sanity checks run on every game: the expert beats random by a wide margin, and do-nothing and always-invalid policies score no better than random.</p>
      </Section>

      <Section id="aggregation" title="IQM, bootstrap intervals and tied groups">
        <p>The <b>ArcadeBench Score</b> is the interquartile mean (IQM) of normalized scores across games and seeds: sort, drop the lowest and highest quarter, average the middle. It is less sensitive to a few lucky or catastrophic seeds than a mean.</p>
        <p>The <b>95% interval</b> is a stratified bootstrap: seeds are resampled within each game, the IQM is recomputed on each resample, and the 2.5th and 97.5th percentiles are reported. Rank intervals come from paired resamples, so every agent sees the same draw.</p>
        <p><b>Tied groups.</b> Walking down the ranking, an entry joins the current group while its upper bound reaches the group leader's lower bound. Entries in a group are shown with a rank range instead of a single rank, because the data cannot separate them.</p>
      </Section>

      <Section id="stability" title="Stability guarantees for entrants">
        <p>Anyone testing a model should get closely matching scores when they run it again.</p>
        <ul>
          <li>A benchmark run plays up to 30 seeds per game, sized so that a mid-strength reference agent reaches an interval of about ±0.05 on every game; the aggregate is tighter.</li>
          <li>Generators keep difficulty within a band, and same-seed normalization cancels board difficulty.</li>
          <li>The official harness uses temperature 0, thinking off and a fixed sampling seed where the provider supports them. Each run records the settings actually used.</li>
          <li>Every benchmark run replays a subset of its seeds, and the scorecard shows the measured run-to-run spread beside the score.</li>
          <li>If an entry's repeat spread exceeds 0.03, its official score is the mean of three full runs and is labelled <b>averaged, high variance</b>.</li>
        </ul>
      </Section>

      <Section id="verified" title="What is verified and what is declared">
        <div className="two">
          <div><h3>Verified by ArcadeBench</h3><ul><li>Every benchmark game, which runs on our server.</li><li>Every action log, re-simulated from the seed.</li><li>Scores, regret, agreement and statistics.</li><li>The random and expert baselines, the only <b>Official</b> badges.</li></ul></div>
          <div><h3>Self-declared by the entrant</h3><ul><li>Model name, snapshot and agent type, tied to the registration. Entries are badged <b>Registered</b>.</li><li>The harness, division and "trained on ArcadeBench seeds?" declaration.</li><li>Tokens, cost and the latency the entrant's setup reports.</li><li>The X handle and optional LinkedIn on a listed scorecard.</li></ul></div>
        </div>
        <p>ArcadeBench runs no model entries itself. Model API keys never reach our server: the Python script and MCP run on your machine, and browser play keeps keys in your session.</p>
      </Section>

      <Section id="lab" title="Decision Lab">
        <p>One decision per item on open datasets, scored with the same harness. It asks whether one-shot decision quality transfers to sequential play. Items are System One questions (choice, no-answer-likely, or score); LLMs and agents answer through the same official prompt per help level. Metrics are accuracy, macro-F1, calibration, latency and cost with bootstrap intervals, plus contamination flags per entry. Benchmark runs use held-out splits; practice uses public splits.</p>
        <p>The animated Lab scenes on the home page are illustrations of the tasks with simulated models; they are not results.</p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Decision Lab datasets">
          <table>
            <caption>Datasets and licences as stated by their publishers</caption>
            <thead><tr><th scope="col">Dataset</th><th scope="col">Task</th><th scope="col">Licence</th></tr></thead>
            <tbody>{DATASETS.map((d) => <tr key={d.id}><th scope="row">{d.url ? <a href={d.url} rel="noopener noreferrer">{d.name}</a> : d.name}</th><td>{d.task}</td><td>{d.licence}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>

      <Section id="privacy" title="Privacy">
        <p>Registration collects an X handle, an email and an optional LinkedIn URL, plus the model name and settings for each entry. The email is private: it is used for sign-in and important notices only, and is never displayed or shared. Accounts and their data can be deleted on request.</p>
        <p>Site analytics are anonymous and cookie-less, and Do Not Track is respected. For each page view we record the path, the referrer host, the browser family, a daily-rotating salted hash of the IP address and a per-tab session id. Nothing else is collected.</p>
      </Section>

      <Section id="versions" title="Versioning">
        <p>Engines use semantic versions, and the major version is part of every seed code. Any change that alters replay outcomes is a major version and starts a new leaderboard column, so old and new scores are never mixed. Official prompts are versioned and hashed. This methodology is v0.1, and changes to it are dated.</p>
        <p className="note">Engine versions in this build: {Object.values(GAMES).map((g) => `${g.name} ${g.version}`).join(', ')}.</p>
      </Section>
    </main>
  );
}
