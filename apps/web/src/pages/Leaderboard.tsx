import { useEffect, useState } from 'react';
import { BASE_PATH, SITE_ORIGIN, type BoardRes } from '@arcadebench/api';
import { GAMES } from '@arcadebench/engine';
import { api } from '../lib/api.ts';
import { usePath } from '../lib/router.ts';
import Board from '../components/Board.tsx';
import { TRACKS } from '../components/board.ts';
import { Field } from '../components/Form.tsx';
import { commit, seasonName } from '../components/format.ts';
import { season, useLoad, useTitle } from '../components/hooks.ts';
import Scorecard from '../components/Scorecard.tsx';
import ShareBar from '../components/ShareBar.tsx';
import { Panel, Tabs } from '../components/Tabs.tsx';
import { standingsCard } from '../share/card.ts';

interface Group { id: string; label: string; games: string[]; track?: string }
const group = (id: string, games: string[], label = GAMES[id]?.name, track?: string): Group => ({ id, label, games, track });
const GROUPS: Group[] = [
  group('overall', [], 'Overall'), ...['tetris', '2048', 'snake', 'sokoban', 'minesweeper', 'connect4'].map((g) => group(g, [g])),
  group('runners', ['dino', 'lanes'], 'Runners', 'latency'), group('originals', ['shifting', 'beams', 'courier'], 'Originals'),
];
const HELP = [['all', 'All levels'], ['0', 'L0 · board only'], ['1', 'L1 · board and features'], ['2', 'L2 · board and outcomes']];

function Standings() {
  const q = new URLSearchParams(location.search), embed = q.has('embed');
  const [g, setG] = useState(GROUPS.find((x) => x.id === q.get('game')) ?? GROUPS[0]);
  const [track, setTrack] = useState(q.get('track') ?? g.track ?? 'turn'), [help, setHelp] = useState(q.get('help') ?? 'all');
  const { data: s } = useLoad(season, []);
  const { data, error } = useLoad(() => Promise.all((g.games.length ? g.games : [undefined]).map((game) => api.leaderboard({ ...(game && { game }), track, ...(help !== 'all' && { help }) }))), [g, track, help]);
  const query = new URLSearchParams({ game: g.id, track, help }).toString(), url = `${SITE_ORIGIN}${BASE_PATH}/leaderboard?${query}`;
  const rows = data?.flatMap((b) => b.rows) ?? [], top = rows[0], name = seasonName(data?.[0].season ?? s?.id ?? 'Season');
  const title = `${name} · ${g.label}`;
  useTitle('Leaderboard');
  useEffect(() => { document.body.classList.toggle('embed', embed); return () => document.body.classList.remove('embed'); }, [embed]);
  useEffect(() => history.replaceState(null, '', `${BASE_PATH}/leaderboard?${query}${embed ? '&embed=1' : ''}`), [query, embed]);
  const pick = (id: string) => { const n = GROUPS.find((x) => x.id === id)!; setG(n); setTrack(n.track ?? 'turn'); };
  const text = `ArcadeBench ${title}${top ? `: ${top.name} ${top.iqm.toFixed(2)} (95% CI ${top.lo.toFixed(2)}–${top.hi.toFixed(2)})` : ''}. Scored move by move against an expert.`;
  const foot = `IQM over hidden seeds · 95% CI${s ? ` · seeds ${commit(s.commitment)}` : ''} · penguinzz.com/arcadebench`;
  const section = (b: BoardRes) => (
    <section key={b.game} aria-label={g.games.length ? GAMES[b.game]?.name : 'Overall'}>
      {g.games.length > 1 && <h3 className="board-h">{GAMES[b.game]?.name ?? b.game}</h3>}
      {b.rows.length ? <Board rows={b.rows} /> : <p className="empty">{seasonName(b.season)} is open. No ranked runs yet{g.games.length > 1 || g.id !== 'overall' ? ' on this track and help level' : ''}.</p>}
    </section>
  );
  return (
    <main>
      <div className="lb-head noembed">
        <div><h1>Leaderboard</h1><p className="lede">Interquartile mean of same-seed normalized scores over the season's hidden seeds, with 95% intervals. Tied entries share a group and show a rank range.</p></div>
        <ShareBar url={url} text={text} name={`arcadebench-${g.id}`} card={() => standingsCard(rows, title, foot)} embed={`<iframe src="${url}&embed=1" width="720" height="560" title="ArcadeBench standings"></iframe>`} />
      </div>
      <Tabs items={GROUPS} value={g.id} onChange={pick} label="Game" />
      <div className="filters noembed">
        <Field id="f-track" label="Track"><select id="f-track" value={track} onChange={(e) => setTrack(e.target.value)}>{TRACKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field id="f-help" label="Help level"><select id="f-help" value={help} onChange={(e) => setHelp(e.target.value)}>{HELP.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      </div>
      <Panel value={g.id} className="boards">
        <div aria-busy={!data && !error}>
          {error ? <p className="empty" role="alert">The leaderboard is unavailable right now. Try again shortly.</p> : data ? data.map(section) : <p className="empty">Loading standings…</p>}
        </div>
      </Panel>
      <p className="lb-foot num">Registered entries are self-declared · baselines are official{s && ` · seed commitment ${commit(s.commitment)}`}{data && ` · updated ${new Date(data[0].updatedAt).toLocaleString()}`}</p>
    </main>
  );
}

export default function Leaderboard() {
  const id = usePath().split('/')[2];
  return id ? <Scorecard id={id} /> : <Standings />;
}
