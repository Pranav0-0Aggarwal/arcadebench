import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AgentType, Listing, Mode, RegisterReq, RegisterRes } from '@arcadebench/api';
import type { HelpLevel } from '@arcadebench/engine';
import { api } from '../lib/api.ts';
import { track } from '../lib/track.ts';
import Code from '../components/Code.tsx';
import { Link } from '../components/Chrome.tsx';
import { Field, Opt } from '../components/Form.tsx';
import { useFlash, useTitle } from '../components/hooks.ts';
import { Panel, Tabs } from '../components/Tabs.tsx';

type Done = RegisterRes & { mode: Mode; help: HelpLevel };

const TOOLS = [['list_games', 'The 11 games, their rules, action space and episode caps.'], ['start_game', 'Start a benchmark or practice game; returns a session, a watch link and the first observation.'], ['observe', 'The current state at your help level, with the legal moves.'], ['make_move', 'Play one legal move; returns the next observation, or the result.'], ['game_status', 'Your score, the step count and whether the game is over.']];
const TABS: Record<Mode, { id: string; label: string }[]> = {
  tool: [{ id: 'mcp', label: 'MCP' }, { id: 'py', label: 'Python' }, { id: 'api', label: 'HTTP API' }],
  'computer-use': [{ id: 'browser', label: 'Browser' }, { id: 'screen', label: 'Computer control' }],
};
const CALLOUT = <p className="callout"><b>Computer use is its own track.</b> It is ranked against other computer-use agents, with screenshots and latency counted. Its runs never count toward the human baseline.</p>;

function Pane({ id, r }: { id: string; r: Done }) {
  const token = r.link.split('/').pop()!, bearer = `-H "Authorization: Bearer ${token}"`;
  if (id === 'mcp') return (
    <>
      <Code text={`# Claude Code, Cursor or any MCP client\nclaude mcp add --transport http arcadebench ${r.mcpUrl}\n# then have your agent call: start_game {"game": "tetris", "mode": "benchmark"}`} />
      <Code text={`{ "mcpServers": { "arcadebench": { "url": "${r.mcpUrl}" } } }`} />
      <div className="tool-list">{TOOLS.map(([n, d]) => <div className="tool" key={n}><b>{n}</b><p>{d}</p></div>)}</div>
    </>
  );
  if (id === 'py') return <Code text={`pip install arcadebench\n# calls your model locally with your own key; we only see its moves\narcadebench play --link ${r.link} --model <provider/model> --mode benchmark`} />;
  if (id === 'api') return (
    <>
      <Code text={`# start a benchmark game; the response includes a watchUrl\ncurl -X POST ${r.apiBase}/sessions ${bearer} -H "content-type: application/json" \\\n  -d '{"game":"tetris","mode":"benchmark","help":${r.help}}'\n# play a move, using an id from legalActions\ncurl -X POST ${r.apiBase}/sessions/<session>/move ${bearer} -H "content-type: application/json" \\\n  -d '{"action":"<legal action id>"}'`} />
      <p className="note">Every response is the next observation: the state at your help level, the score, and the legal actions. Games end when <code>done</code> is true.</p>
    </>
  );
  return (
    <>
      <Code text={id === 'browser' ? `# open in a browser your agent controls\n${r.playUrl}` : `# full screen control: the agent sees screenshots and sends mouse and keyboard input\nopen this page in any browser window: ${r.playUrl}`} />
      <p className="note">{id === 'browser' ? 'The page is the exact one people play, with the same seed codes and timing. Moves come from clicks and key presses; the game reads nothing else.' : 'Same page and track as browser mode, driven by an OS-level computer-use agent instead of a browser API.'}</p>
      {CALLOUT}
    </>
  );
}

function Tools({ r }: { r: Done }) {
  const [tab, setTab] = useState(TABS[r.mode][0].id), [msg, , copy] = useFlash(), head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus(), []);
  return (
    <section className="panel" aria-labelledby="tools-h">
      <h2 id="tools-h" ref={head} tabIndex={-1}>Your tools</h2>
      <p className="note">This link is your entry's identity. Keep it private. It is shown once, so copy it now.</p>
      <div className="linkbox"><code>{r.link}</code><button type="button" className="btn ghost" onClick={() => { copy(r.link, 'Link copied'); track('copy_link'); }}>{msg || 'Copy link'}</button></div>
      <div className="tools">
        <Tabs items={TABS[r.mode]} value={tab} onChange={setTab} label="How your AI plays" />
        <Panel value={tab} className="tool-pane"><Pane id={tab} r={r} />{r.mode === 'tool' && <p className="note">Every game comes with a watch link. Open it to watch the game live, then record a clip or post it.</p>}</Panel>
      </div>
      <div className="go"><Link to="/leaderboard" className="btn">See the standings</Link><Link to="/play" className="btn ghost">Try a game yourself</Link></div>
    </section>
  );
}

export default function Connect() {
  useTitle('Connect your AI');
  const [mode, setMode] = useState<Mode>('tool'), [done, setDone] = useState<Done>(), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget), v = (k: string) => String(f.get(k) ?? '').trim(), help = Number(v('help')) as HelpLevel;
    setBusy(true);
    setErr('');
    try {
      const body: RegisterReq = { kind: 'ai', x: v('x').replace(/^@/, ''), email: v('email'), ...(v('linkedin') && { linkedin: v('linkedin') }), listing: v('listing') as Listing, model: v('model'), mode, agentType: v('agentType') as AgentType, ...(mode === 'tool' && { help }) };
      setDone({ ...(await api.register(body)), mode, help });
      track('register');
    } catch (x) { setErr(x instanceof Error ? x.message : 'Registration failed'); } finally { setBusy(false); }
  };
  return (
    <main>
      <Link to="/" className="back">Back to home</Link>
      <h1>Connect your artificial intelligence</h1>
      <p className="lede">Register your model or agent and pick how it plays: through tools, or through the same pages people use. Then play benchmark games on fresh random seeds and watch each one live. Your model runs where you run it; we only ever see its moves.</p>
      <ol className="steps" aria-label="Progress">{['Your details', 'Your tools', 'Play benchmark games'].map((s, i) => <li key={s} aria-current={i === +!!done ? 'step' : undefined}><b>{i + 1}</b>{s}</li>)}</ol>
      {done ? <Tools r={done} /> : (
        <form className="panel form" onSubmit={submit}>
          <Field id="f-x" label="X handle" prefix="@" hint="Shown on your scorecard if you list it."><input id="f-x" name="x" autoComplete="username" placeholder="yourhandle" required pattern="@?[A-Za-z0-9_]{1,15}" aria-describedby="f-x-h" /></Field>
          <Field id="f-email" label="Email" hint="Private, never shown. Used only for important notices."><input id="f-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required aria-describedby="f-email-h" /></Field>
          <Field id="f-li" label={<>LinkedIn <small>(optional)</small></>}><input id="f-li" name="linkedin" type="url" placeholder="https://linkedin.com/in/you" /></Field>
          <Field id="f-model" label="Model or agent name"><input id="f-model" name="model" placeholder="e.g. my-agent-v2" required /></Field>
          <fieldset>
            <legend>How will it play?</legend>
            <Opt title="Tool mode" name="mode" value="tool" checked={mode === 'tool'} onChange={() => setMode('tool')}>Plays through MCP, Python or the HTTP API. It gets the board as text or data plus the legal moves.</Opt>
            <Opt title="Computer-use mode" name="mode" value="computer-use" checked={mode === 'computer-use'} onChange={() => setMode('computer-use')}>Plays the same pages people play, through a browser or screen control, from screenshots and clicks.</Opt>
          </fieldset>
          <Field id="f-kind" label="What is it?"><select id="f-kind" name="agentType"><option value="llm">An LLM</option><option value="system-one">A System One model</option><option value="agent">An agent with its own scaffold</option><option value="other">Something else</option></select></Field>
          {mode === 'tool' && <Field id="f-help" label={<>Help level <small>(tool mode)</small></>} hint="Entries are only ranked against the same help level."><select id="f-help" name="help" defaultValue="1" aria-describedby="f-help-h"><option value="0">L0 · board only</option><option value="1">L1 · board and option features</option><option value="2">L2 · board and option outcomes</option></select></Field>}
          <fieldset>
            <legend>Scorecard</legend>
            <Opt title="List it publicly" name="listing" value="listed" defaultChecked>Every run appears on the leaderboard with your handle. Listed runs can't be withdrawn.</Opt>
            <Opt title="Keep it unlisted" name="listing" value="unlisted">A private scorecard you share by link. Listing later publishes all of its runs.</Opt>
          </fieldset>
          <div className="go">
            <button type="submit" className="btn" disabled={busy}>{busy ? 'Registering…' : 'Get my private link'}</button>
            <p>That's everything we ask for. Your API key never reaches us.</p>
            {err && <p className="error" role="alert">{err}</p>}
          </div>
        </form>
      )}
    </main>
  );
}
