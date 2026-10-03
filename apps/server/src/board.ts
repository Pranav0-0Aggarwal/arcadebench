import { inflateSync } from 'node:zlib';
import type { BoardRes, BoardRow, RunRes, RunSummary, Scorecard, Track } from '@arcadebench/api';
import { GAMES, PAPER_CAPS, seedCodeOf, type HelpLevel } from '@arcadebench/engine';
import type { Decision } from '@arcadebench/eval';
import { bootstrap, iqm, rankIntervals, sd, tiedGroups } from '@arcadebench/stats';
import type { Db, Entry } from './db.ts';
import { SEEDS, type Seasons } from './seasons.ts';
import { Fail } from './util.ts';

export const REPS = 1000, SPREAD_LIMIT = 0.03;

interface Row { entry: string; game: string; seed: number; repeat: number; norm: number; agree: number; dec: number; name: string; x: string; agent_type: BoardRow['agentType'] | null; help: HelpLevel }
interface Acc { row: Row; first: Map<string, number>; again: Map<string, number>; agree: number; dec: number }

const ROWS = `
  SELECT r.entry, r.game, r.seed, r.repeat, r.norm, r.agree, r.dec, e.name, e.x, e.agent_type, e.help FROM runs r JOIN entries e ON e.id = r.entry
  WHERE r.season = ? AND r.track = ? AND r.norm IS NOT NULL AND (r.ranked = 1 OR r.track IN ('human', 'computer-use')) AND (e.listing = 'listed' OR e.id = ?)
    AND (? = 'overall' OR r.game = ?) AND (? = 'all' OR r.help = ?)
  ORDER BY r.n`;

export function makeBoard(db: Db, seasons: Seasons, now: () => number) {
  const cache = new Map<string, BoardRes>();

  function compute(game: string, track: Track, help: HelpLevel | 'all', extra = ''): BoardRes {
    const season = seasons.current(), accs = new Map<string, Acc>(), seen = new Set<string>();
    for (const r of db.all<Row>(ROWS, season.id, track, extra, game, game, help, help)) {
      const key = `${r.entry}|${r.game}|${r.seed}|${r.repeat}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = accs.get(r.entry) ?? accs.set(r.entry, { row: r, first: new Map(), again: new Map(), agree: 0, dec: 0 }).get(r.entry)!;
      (r.repeat ? a.again : a.first).set(`${r.game}|${r.seed}`, r.norm);
      a.agree += r.agree; a.dec += r.dec;
    }
    const scored = [...accs].map(([id, a]) => {
      const paired = [...a.again.keys()].filter((k) => a.first.has(k));
      const spread = paired.length ? sd([iqm(paired.map((k) => a.first.get(k)!)), iqm(paired.map((k) => a.again.get(k)!))]) : null;
      const averaged = spread !== null && spread > SPREAD_LIMIT, byGame: Record<string, number[]> = {};
      for (const [k, v] of a.first) (byGame[k.split('|')[0]] ??= []).push(averaged && a.again.has(k) ? (v + a.again.get(k)!) / 2 : v);
      return { id, a, spread, averaged, seeds: Object.values(byGame).reduce((t, v) => t + v.length, 0), b: bootstrap(byGame, iqm, REPS) };
    });
    const seeds = SEEDS * (game === 'overall' ? Object.keys(GAMES).length : 1);
    const official = [{ id: 'expert', point: 1 }, { id: 'random', point: 0 }];
    const reps = Object.fromEntries([...official.map((o) => [o.id, Array<number>(REPS).fill(o.point)]), ...scored.map((s) => [s.id, s.b.reps])]);
    const groups = tiedGroups([...official.map((o) => ({ name: o.id, point: o.point, lo: o.point, hi: o.point })), ...scored.map((s) => ({ name: s.id, point: s.b.point, lo: s.b.lo, hi: s.b.hi }))]);
    const ranks = rankIntervals(reps), group = (id: string) => groups.findIndex((g) => g.some((e) => e.name === id)) + 1;
    const rows: BoardRow[] = [
      ...official.map((o): BoardRow => ({ entryId: o.id, name: o.id, badge: 'official', track, iqm: o.point, lo: o.point, hi: o.point, rank: ranks[o.id], group: group(o.id), seeds, agreement: o.point === 1 ? 1 : null, retestSpread: null, averaged: false })),
      ...scored.map((s): BoardRow => ({
        entryId: s.id, name: s.a.row.name, x: s.a.row.x, badge: 'registered', ...(s.a.row.agent_type ? { agentType: s.a.row.agent_type } : {}), track, help: s.a.row.help,
        iqm: s.b.point, lo: s.b.lo, hi: s.b.hi, rank: ranks[s.id], group: group(s.id), seeds: s.seeds, agreement: s.a.dec ? s.a.agree / s.a.dec : null, retestSpread: s.spread, averaged: s.averaged,
      })),
    ].sort((p, q) => q.iqm - p.iqm);
    return { season: season.id, game, track, help, rows, updatedAt: new Date(now()).toISOString() };
  }

  function board(game: string, track: Track, help: HelpLevel | 'all', extra?: string): BoardRes {
    if (extra) return compute(game, track, help, extra);
    const key = `${game}|${track}|${help}`;
    return cache.get(key) ?? cache.set(key, compute(game, track, help)).get(key)!;
  }

  const hidden = (season: string, ranked: number) => ranked === 1 && season === seasons.current().id;

  function run(id: string, viewer: Entry | null): RunRes {
    const r = db.get<{ id: string; entry: string | null; season: string; game: string; version: string; seed: number; track: Track; help: HelpLevel; ranked: number; score: number; norm: number | null; steps: number; created: string; ep: Uint8Array; name: string | null; x: string | null; listing: string | null }>(
      'SELECT r.*, e.name, e.x, e.listing FROM runs r LEFT JOIN entries e ON e.id = r.entry WHERE r.id = ?', id);
    if (!r || (r.listing === 'unlisted' && r.entry !== viewer?.id)) throw new Fail(404, 'unknown run');
    const veiled = hidden(r.season, r.ranked), ep = JSON.parse(inflateSync(r.ep).toString()) as { actions: string[]; decisions: Decision[] };
    return {
      id: r.id, entry: { name: r.name ?? 'anonymous', ...(r.listing === 'listed' ? { x: r.x! } : {}), badge: 'registered' }, game: r.game, version: r.version, seedCode: veiled ? '' : seedCodeOf(r.game, r.seed),
      track: r.track, help: r.help, score: r.score, normalized: r.norm, steps: r.steps, actions: veiled ? [] : ep.actions,
      decisions: veiled ? [] : ep.decisions.map(({ step, action, expert, agree, regret, forced, invalid, latencyMs }) => ({ step, action, expert, agree, regret, forced, invalid, latencyMs })), createdAt: r.created,
    };
  }

  function runs(game: string, seed: number | undefined, limit: number): RunSummary[] {
    const rows = db.all<{ id: string; seed: number; track: Track; help: HelpLevel; score: number; norm: number | null; steps: number; created: string; name: string; x: string }>(
      `SELECT r.id, r.seed, r.track, r.help, r.score, r.norm, r.steps, r.created, e.name, e.x FROM runs r JOIN entries e ON e.id = r.entry
       WHERE r.game = ? AND (? IS NULL OR r.seed = ?) AND e.listing = 'listed' AND (r.ranked = 0 OR r.season <> ?) ORDER BY r.n DESC LIMIT ?`, game, seed ?? null, seed ?? null, seasons.current().id, limit);
    const ref = seed === undefined ? undefined : db.get<{ expert: number; random: number }>('SELECT expert, random FROM refs WHERE game = ? AND seed = ? AND cap = ?', game, seed, PAPER_CAPS[game]);
    const official = ref ? (['expert', 'random'] as const).map((name): RunSummary => ({ id: name, entry: { name, badge: 'official' }, game, seedCode: seedCodeOf(game, seed!), track: 'turn', help: 0, score: ref[name], normalized: +(name === 'expert'), steps: 0, createdAt: new Date(now()).toISOString() })) : [];
    return [...official, ...rows.map((r): RunSummary => ({ id: r.id, entry: { name: r.name, x: r.x, badge: 'registered' }, game, seedCode: seedCodeOf(game, r.seed), track: r.track, help: r.help, score: r.score, normalized: r.norm, steps: r.steps, createdAt: r.created }))];
  }

  function scorecard(e: Entry): Scorecard {
    const tracks = db.all<{ track: Track }>('SELECT DISTINCT track FROM runs WHERE entry = ?', e.id);
    const runs = db.all<{ id: string; game: string; seed: number; season: string; ranked: number; score: number; norm: number | null; created: string }>('SELECT id, game, seed, season, ranked, score, norm, created FROM runs WHERE entry = ? ORDER BY n DESC LIMIT 500', e.id);
    return {
      entryId: e.id, name: e.name, listing: e.listing, ...(e.mode ? { mode: e.mode } : {}),
      rows: tracks.flatMap((t) => board('overall', t.track, 'all', e.listing === 'unlisted' ? e.id : undefined).rows.filter((r) => r.entryId === e.id)),
      runs: runs.map((r) => ({ id: r.id, game: r.game, seedCode: hidden(r.season, r.ranked) ? '' : seedCodeOf(r.game, r.seed), score: r.score, normalized: r.norm, createdAt: r.created })),
    };
  }

  return { board, run, runs, scorecard, invalidate: () => cache.clear() };
}
export type Board = ReturnType<typeof makeBoard>;
