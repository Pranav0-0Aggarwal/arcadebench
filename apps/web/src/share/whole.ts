import { API, type LiveFrame, type MatchLive } from '@arcadebench/api';
import { GAMES, parseSeedCode, replayLine } from '@arcadebench/engine';
import { who } from '../components/format.ts';
import { matchData, matchEntry, matchTitle, points } from '../components/match.ts';
import { api } from '../lib/api.ts';
import type { Clip, Grid } from './clip.ts';

interface Base { game: string; actions: string[]; who: string; seedCode: string; entry?: LiveFrame['entry'] }
export type Source = Base & ({ seed: number; match?: undefined } | { match: MatchLive; seed?: undefined });
export type Tag = Pick<Source, 'game' | 'seedCode' | 'entry' | 'match'>;

export const matchSource = (match: MatchLive, actions: string[]): Source => ({ game: 'chess', actions, who: matchTitle(match), seedCode: '', entry: matchEntry(match), match });

export async function watchSource(id: string): Promise<Source> {
  const r = await fetch(`${API}/watch/${encodeURIComponent(id)}`), j = await r.json().catch(() => ({}));
  const s = r.ok ? j : j.runId ? await api.run(j.runId) : null;
  if (!s) throw new Error('This game is no longer available');
  if (s.match) return matchSource(s.match, s.actions ?? []);
  return { game: s.game, seed: parseSeedCode(s.seedCode)!.seed, actions: s.actions ?? [], who: who(s.entry), seedCode: s.seedCode, entry: s.entry };
}

function replay(src: Source) {
  if (src.match) {
    const m = src.match, line = replayLine(src.actions), n = line.length - 1;
    return { name: 'Chess', n, at: (i: number) => ({ data: matchData(line[i], m, i, i === n), score: points(m) }), src };
  }
  const g = GAMES[src.game], st = [g.init(src.seed)];
  for (const a of src.actions) { const s = st[st.length - 1]; st.push(!g.done(s) && g.legal(s).includes(a) ? g.step(s, a) : s); }
  return { name: g.name, n: st.length - 1, at: (i: number) => ({ data: g.data(st[i]), score: g.score(st[i]) }), src };
}

export function ended(src: Source) {
  const r = replay(src);
  return { ...r.at(r.n), step: r.n, match: src.match };
}

export function heading(bs: Tag[]) {
  const names = bs.map((b) => b.entry?.name ?? 'Anonymous'), same = (k: (b: Tag) => string) => bs.every((b) => k(b) === k(bs[0])), game = same((b) => b.game);
  const title = game ? `${[...new Set(names)].join(bs.some((b) => b.match) ? ' · ' : ' vs ')} on ${GAMES[bs[0].game].name}` : new Set(names).size === 1 ? `${names[0]} on ${bs.length} tasks` : `${bs.length} runs`;
  return { title, sub: game && bs[0].seedCode && same((b) => b.seedCode) ? `same seed ${bs[0].seedCode}` : '' };
}

const clip = (r: ReturnType<typeof replay>, i: number, final: boolean): Clip => ({ game: r.src.game, ...r.at(i), title: r.name, who: r.src.who, seedCode: r.src.seedCode, at: i, total: r.n, final });

function one(src: Source, max: number): Clip[] {
  const r = replay(src), n = r.n + 1, a = Math.min(n - 1, 1), k = Math.min(n - a, max);
  const at = k < 2 ? [n - 1] : Array.from({ length: k }, (_, i) => a + Math.round(i * (n - 1 - a) / (k - 1)));
  return at.map((i, j) => clip(r, i, j === at.length - 1));
}

function many(srcs: Source[], max: number): Grid[] {
  const rs = srcs.map(replay), k = Math.min(max, Math.max(...rs.map((r) => r.n + 1))), head = heading(srcs);
  return Array.from({ length: k }, (_, j) => ({ ...head, cells: rs.map((r, b) => clip(r, Math.round((k > 1 ? j / (k - 1) : 1) * r.n), j === k - 1)) }));
}

export const frames = (src: Source | Source[], max: number) => (Array.isArray(src) ? many(src, max) : one(src, max));
