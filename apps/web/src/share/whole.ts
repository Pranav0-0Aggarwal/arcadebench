import { API, type LiveFrame } from '@arcadebench/api';
import { GAMES, parseSeedCode } from '@arcadebench/engine';
import { who } from '../components/format.ts';
import { api } from '../lib/api.ts';
import type { Clip, Grid } from './clip.ts';

export interface Source { game: string; seed: number; actions: string[]; who: string; seedCode: string; entry?: LiveFrame['entry'] }
export type Tag = Pick<Source, 'game' | 'seedCode' | 'entry'>;

export async function watchSource(id: string): Promise<Source> {
  const r = await fetch(`${API}/watch/${encodeURIComponent(id)}`), j = await r.json().catch(() => ({}));
  const s = r.ok ? j : j.runId ? await api.run(j.runId) : null;
  if (!s) throw new Error('This game is no longer available');
  return { game: s.game, seed: parseSeedCode(s.seedCode)!.seed, actions: s.actions ?? [], who: who(s.entry), seedCode: s.seedCode, entry: s.entry };
}

function replay(src: Source) {
  const g = GAMES[src.game], st = [g.init(src.seed)];
  for (const a of src.actions) { const s = st[st.length - 1]; st.push(!g.done(s) && g.legal(s).includes(a) ? g.step(s, a) : s); }
  return { g, st, src };
}

export function ended(src: Source) {
  const { g, st } = replay(src), s = st[st.length - 1];
  return { data: g.data(s), score: g.score(s), step: st.length - 1 };
}

export function heading(bs: Tag[]) {
  const names = bs.map((b) => b.entry?.name ?? 'Anonymous'), same = (k: (b: Tag) => string) => bs.every((b) => k(b) === k(bs[0])), game = same((b) => b.game);
  const title = game ? `${[...new Set(names)].join(' vs ')} on ${GAMES[bs[0].game].name}` : new Set(names).size === 1 ? `${names[0]} on ${bs.length} tasks` : `${bs.length} runs`;
  return { title, sub: game && same((b) => b.seedCode) ? `same seed ${bs[0].seedCode}` : '' };
}

const clip = ({ g, st, src }: ReturnType<typeof replay>, i: number, final: boolean): Clip => ({ game: src.game, data: g.data(st[i]), title: g.name, who: src.who, score: g.score(st[i]), seedCode: src.seedCode, at: i, total: st.length - 1, final });

function one(src: Source, max: number): Clip[] {
  const r = replay(src), n = r.st.length, a = Math.min(n - 1, 1), k = Math.min(n - a, max);
  const at = k < 2 ? [n - 1] : Array.from({ length: k }, (_, i) => a + Math.round(i * (n - 1 - a) / (k - 1)));
  return at.map((i, j) => clip(r, i, j === at.length - 1));
}

function many(srcs: Source[], max: number): Grid[] {
  const rs = srcs.map(replay), k = Math.min(max, Math.max(...rs.map((r) => r.st.length))), head = heading(srcs);
  return Array.from({ length: k }, (_, j) => ({ ...head, cells: rs.map((r, b) => clip(r, Math.round((k > 1 ? j / (k - 1) : 1) * (r.st.length - 1)), j === k - 1)) }));
}

export const frames = (src: Source | Source[], max: number) => (Array.isArray(src) ? many(src, max) : one(src, max));
