import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '@arcadebench/api';
import { expertAction, GAMES, LAB, CAPS, parseSeedCode, replay, seedCodeOf } from '@arcadebench/engine';
import { REFRESH_MS } from './board.ts';
import { MIGRATIONS, openDb } from './db.ts';
import { ai, frames, human, ORIGIN, setup, until } from './harness.ts';
import { rid } from './util.ts';

let t: ReturnType<typeof setup>;
beforeEach(() => { t = setup(); });
afterEach(() => t.close());

const seedRun = (entry: string, game: string, seed: number, repeat: number, norm: number, cap = CAPS[game]) =>
  t.db.run('INSERT INTO runs (id, entry, game, version, seed, repeat, track, help, cap, bench, score, norm, steps, agree, dec, truncated, created, ep) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, 0, 0, 0, 0, ?, ?)',
    rid(), entry, game, GAMES[game].version, seed, repeat, 'turn', 1, cap, norm, new Date().toISOString(), new Uint8Array());
const collect = async (res: Response) => { const a: any[] = []; for await (const f of frames(res)) a.push(f); return a; };
const stream = (watch: string) => t.app.request(`/arcadebench/api/v1/watch/${watch}/stream`);

describe('register', () => {
  it('rejects every malformed field and accepts a good entry', async () => {
    const bad = (b: object) => t.send('POST', '/register', { ...ai(), ...b });
    for (const b of [{ x: 'has space' }, { x: 'x'.repeat(16) }, { x: '' }, { email: 'nope' }, { email: 'a@b' }, { linkedin: 'https://evil.com/in/me' }, { linkedin: 'https://linkedin.com.evil.com/x' }, { linkedin: 'javascript:alert(1)' }, { kind: 'robot' }, { listing: 'maybe' }, { mode: 'cloud' }, { agentType: 'x' }, { help: 3 }, { model: '' }, { model: 'm'.repeat(81) }]) {
      const r = await bad(b);
      expect(r.status, JSON.stringify(b)).toBe(400);
      expect(r.body.error).toBeTruthy();
    }
    expect((await t.send('POST', '/register', [1])).status).toBe(400);
    expect((await t.send('POST', '/register', { ...human, skill: 'pro' })).status).toBe(400);
    const ok = await t.send('POST', '/register', { ...ai('gpt-x'), linkedin: 'https://www.linkedin.com/in/someone' });
    expect(ok.status).toBe(200);
    expect(ok.body.link).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ok.body.mcpUrl).toBe(`${ORIGIN}/arcadebench/mcp/${ok.body.link}`);
    expect(ok.body.playUrl).toBe(`${ORIGIN}/arcadebench/play?as=agent&link=${ok.body.link}`);
    expect(ok.body.apiBase).toBe(`${ORIGIN}/arcadebench/api/v1`);
    const card = await t.send('GET', `/entries/${ok.body.entryId}`);
    expect(card.text).not.toContain('example.com');
    expect(card.body.name).toBe('gpt-x');
  });

  it('rate limits registration per address', async () => {
    const codes: number[] = [];
    for (let i = 0; i < LIMITS.registerPerIpPerHour + 1; i++) codes.push((await t.send('POST', '/register', {})).status);
    expect(codes.slice(0, -1).every((c) => c === 400)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  it('limits body size', async () => {
    const r = await t.send('POST', '/register', { ...ai(), model: 'x'.repeat(LIMITS.bodyBytes) });
    expect(r.status).toBe(413);
  });
});

describe('auth and limits', () => {
  it('needs a valid token for benchmark play, and sessions belong to their owner', async () => {
    for (const mode of ['benchmark', 'ranked']) expect((await t.send('POST', '/sessions', { game: 'beams', mode })).status).toBe(401);
    expect((await t.send('POST', '/sessions', { game: 'beams', mode: 'benchmark' }, 'not-a-token')).status).toBe(401);
    const a = await t.register(ai('a')), b = await t.register(ai('b'));
    const s = await t.send('POST', '/sessions', { game: 'beams', mode: 'practice', seed: 1 }, a.link);
    expect(s.status).toBe(200);
    expect((await t.send('GET', `/sessions/${s.body.session}`, undefined, a.link)).status).toBe(200);
    expect((await t.send('GET', `/sessions/${s.body.session}`, undefined, b.link)).status).toBe(404);
    expect((await t.send('GET', `/sessions/${s.body.session}`)).status).toBe(404);
    expect((await t.send('POST', `/sessions/${s.body.session}/move`, { action: 'flip0' })).status).toBe(404);
    const h = await t.register(human);
    expect((await t.send('POST', '/sessions', { game: 'beams', mode: 'benchmark' }, h.link)).status).toBe(403);
  });

  it('rate limits per token', async () => {
    const a = await t.register(ai());
    let last = 0;
    for (let i = 0; i <= LIMITS.requestsPerTokenPerMinute; i++) last = (await t.send('GET', '/sessions/none', undefined, a.link)).status;
    expect(last).toBe(429);
  });

  it('caps open sessions per owner', async () => {
    const codes: number[] = [];
    for (let i = 0; i <= LIMITS.maxOpenSessionsPerToken; i++) codes.push((await t.send('POST', '/sessions', { game: 'beams', mode: 'practice', seed: i })).status);
    expect(codes.at(-1)).toBe(429);
    expect(codes.slice(0, -1).every((c) => c === 200)).toBe(true);
  });

  it('validates session requests', async () => {
    for (const b of [{ game: 'nope', mode: 'practice' }, { game: 'beams', mode: 'free' }, { game: 'beams', mode: 'practice', seed: -1 }, { game: 'beams', mode: 'practice', seedCode: 'TET-0001-AAAA' }, { game: 'dino', mode: 'practice', clock: 'sometimes' }]) {
      expect((await t.send('POST', '/sessions', b)).status, JSON.stringify(b)).toBe(400);
    }
  });

  it('adds CORS only to public GET routes and sets CSP on the site', async () => {
    expect((await t.send('GET', '/games')).headers.get('access-control-allow-origin')).toBe('*');
    expect((await t.send('POST', '/register', {})).headers.get('access-control-allow-origin')).toBeNull();
    expect((await t.send('GET', '/sessions/x')).headers.get('access-control-allow-origin')).toBeNull();
    const html = await t.send('GET', '/arcadebench/');
    expect(html.status).toBe(200);
    expect(html.headers.get('content-security-policy')).toContain("connect-src 'self'");
    expect(html.headers.get('x-content-type-options')).toBe('nosniff');
    expect(html.headers.get('x-frame-options')).toBe('DENY');
    expect(html.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    const embed = await t.send('GET', '/arcadebench/leaderboard?game=tetris&embed=1');
    expect(embed.headers.get('content-security-policy')).toContain('frame-ancestors *');
    expect(embed.headers.get('x-frame-options')).toBeNull();
    expect((await t.send('GET', '/arcadebench/leaderboard')).headers.get('x-frame-options')).toBe('DENY');
    expect((await t.send('GET', '/arcadebench/')).headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect((await t.send('GET', '/arcadebench/leaderboard/abc')).headers.get('x-frame-options')).toBe('DENY');
  });
});

describe('practice', () => {
  it('plays to the end, stores the run and counts invalid moves', async () => {
    const a = await t.register(ai('p'));
    const s = await t.send('POST', '/sessions', { game: 'minesweeper', mode: 'practice', seed: 4 }, a.link);
    expect(s.body.seedCode).toBe(seedCodeOf('minesweeper', 4));
    expect(s.body.rules).toBeTruthy();
    const bad = await t.send('POST', `/sessions/${s.body.session}/move`, { action: '' }, a.link);
    expect(bad.body.invalid).toContain('Legal actions');
    expect(bad.body.step).toBe(0);
    let o = bad.body;
    while (!o.done) o = (await t.send('POST', `/sessions/${o.session}/move`, { action: o.legalActions[0].id }, a.link)).body;
    expect((await t.send('POST', `/sessions/${o.session}/move`, { action: 'x' }, a.link)).status).toBe(409);
    const card = (await t.send('GET', `/entries/${a.entryId}`, undefined, a.link)).body;
    expect(card.runs).toHaveLength(1);
    expect(card.runs[0].score).toBe(o.score);
    expect(card.runs[0].seedCode).toBe(seedCodeOf('minesweeper', 4));
    const run = (await t.send('GET', `/runs/${card.runs[0].id}`, undefined, a.link)).body;
    expect(run.decisions.length).toBe(run.steps);
    expect(run.entry.name).toBe('p');
  });

  it('stores abandoned sessions as truncated runs when they expire', async () => {
    const a = await t.register(ai());
    const s = await t.send('POST', '/sessions', { game: 'minesweeper', mode: 'practice', seed: 1 }, a.link);
    await t.send('POST', `/sessions/${s.body.session}/move`, { action: s.body.legalActions[0].id }, a.link);
    t.clock.t += 31 * 60 * 1000;
    t.sweep();
    expect((await t.send('GET', `/sessions/${s.body.session}`, undefined, a.link)).status).toBe(404);
    expect((await t.send('GET', `/entries/${a.entryId}`, undefined, a.link)).body.runs).toHaveLength(1);
  });

  it('keeps anonymous practice off the leaderboards', async () => {
    const p = await t.play(undefined, 'minesweeper', 'practice', { seed: 2 });
    expect(p.first.status).toBe(200);
    const board = (await t.send('GET', '/leaderboard?game=minesweeper')).body;
    expect(board.rows.map((r: any) => r.entryId)).toEqual(['expert', 'random']);
  });

  it('serves the daily seeds deterministically', async () => {
    const d = (await t.send('GET', '/seeds/daily')).body;
    expect(Object.keys(d.seeds).sort()).toEqual(Object.keys(GAMES).sort());
    for (const [g, code] of Object.entries<string>(d.seeds)) expect(parseSeedCode(code)?.game).toBe(g);
    expect((await t.send('GET', '/seeds/daily')).body).toEqual(d);
    t.clock.t += 864e5;
    expect((await t.send('GET', '/seeds/daily')).body.seeds).not.toEqual(d.seeds);
  });
});

describe('verify', () => {
  it('accepts the action list a client played, with forced moves left out', async () => {
    const p = await t.play(undefined, 'sokoban', 'practice', { seed: 1 });
    expect(p.last.step).toBeGreaterThan(p.chosen.length);
    const v = await t.send('POST', '/practice/verify', { game: 'sokoban', seedCode: seedCodeOf('sokoban', 1), actions: p.chosen });
    expect(v.status).toBe(200);
    expect(v.body.score).toBe(p.last.score);
    expect(typeof v.body.normalized).toBe('number');
    expect(v.body.compare.map((c: any) => c.name).slice(0, 2)).toEqual(['expert', 'random']);
    const run = (await t.send('GET', `/runs/${v.body.runId}`)).body;
    expect(run.score).toBe(p.last.score);
    expect(run.track).toBe('human');
    expect(run.steps).toBe(p.last.step);
    expect(run.entry.name).toBe('anonymous');
  });

  it('rejects tampered, overlong and mismatched logs', async () => {
    const p = await t.play(undefined, 'minesweeper', 'practice', { seed: 6 });
    const code = seedCodeOf('minesweeper', 6), send = (b: object) => t.send('POST', '/practice/verify', { game: 'minesweeper', seedCode: code, ...b });
    expect((await send({ actions: [...p.chosen.slice(0, -1), 'teleport'] })).status).toBe(422);
    expect((await send({ actions: [...p.chosen, p.chosen[0]] })).status).toBe(422);
    expect((await send({ actions: [p.chosen[0], p.chosen[0]] })).status).toBe(422);
    expect((await send({ actions: 'no' })).status).toBe(400);
    expect((await send({ actions: [], seedCode: seedCodeOf('beams', 6) })).status).toBe(400);
    expect((await send({ actions: [], seedCode: 'junk' })).status).toBe(400);
    expect((await t.send('POST', '/practice/verify', { game: 'beams', seedCode: seedCodeOf('beams', 6), actions: Array(65).fill('flip0') })).status).toBe(400);
    expect((await send({ actions: p.chosen })).status).toBe(200);
  });

  it('files computer-use runs only for computer-use entries', async () => {
    const body = { game: 'beams', seedCode: seedCodeOf('beams', 3), actions: [], as: 'agent' };
    expect((await t.send('POST', '/practice/verify', body)).status).toBe(401);
    const tool = await t.register(ai());
    expect((await t.send('POST', '/practice/verify', body, tool.link)).status).toBe(403);
    const cu = await t.register(ai('cu', 'listed', { mode: 'computer-use' }));
    const v = await t.send('POST', '/practice/verify', body, cu.link);
    expect(v.status).toBe(200);
    expect((await t.send('GET', `/runs/${v.body.runId}`)).body.track).toBe('computer-use');
    const h = await t.register(human);
    const hv = await t.send('POST', '/practice/verify', { ...body, as: 'human' }, h.link);
    expect((await t.send('GET', `/runs/${hv.body.runId}`)).body.track).toBe('human');
    expect((await t.send('GET', `/entries/${h.entryId}`)).body.runs).toHaveLength(1);
    expect((await t.send('POST', '/practice/verify', body, 'wrong')).status).toBe(401);
  });

  it('compares against listed model runs on the same seed', async () => {
    const a = await t.register(ai('rival'));
    await t.play(a.link, 'minesweeper', 'practice', { seed: 8 });
    const v = await t.send('POST', '/practice/verify', { game: 'minesweeper', seedCode: seedCodeOf('minesweeper', 8), actions: [] });
    expect(v.body.compare.map((c: any) => c.name)).toContain('rival');
  });
});

describe('benchmark', () => {
  it('draws a fresh open seed for every run and publishes the full run at once', async () => {
    const a = await t.register(ai('fresh')), seeds: number[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await t.play(a.link, 'minesweeper', i === 2 ? 'ranked' : 'benchmark');
      const code = parseSeedCode(p.first.body.seedCode)!;
      expect(code.game).toBe('minesweeper');
      expect(code.seed).toBeLessThan(2 ** 31);
      expect(p.last.seedCode).toBe(p.first.body.seedCode);
      seeds.push(code.seed);
    }
    expect(new Set(seeds).size).toBe(3);
    const card = (await t.send('GET', `/entries/${a.entryId}`, undefined, a.link)).body;
    expect(card.runs.map((r: any) => r.seedCode).reverse()).toEqual(seeds.map((s) => seedCodeOf('minesweeper', s)));
    const run = (await t.send('GET', `/runs/${card.runs[0].id}`, undefined, a.link)).body;
    expect(run.seedCode).toBe(seedCodeOf('minesweeper', seeds[2]));
    expect(run.actions.length).toBeGreaterThan(0);
    expect(run.decisions.length).toBeGreaterThan(0);
    expect((await t.send('POST', '/sessions', { game: 'minesweeper', mode: 'benchmark', help: 2 }, a.link)).status).toBe(400);
  });

  it('stops adaptively, then replays the first 3 seeds, then answers 409', async () => {
    const a = await t.register(ai('adaptive')), start = (game = 'minesweeper') => t.send('POST', '/sessions', { game, mode: 'benchmark' }, a.link);
    for (let i = 0; i < 9; i++) seedRun(a.entryId, 'minesweeper', 100 + i, 0, 0.5);
    const fresh = await start();
    expect(fresh.status).toBe(200);
    expect(Array.from({ length: 9 }, (_, i) => 100 + i)).not.toContain(parseSeedCode(fresh.body.seedCode)!.seed);
    seedRun(a.entryId, 'minesweeper', 109, 0, 0.5);
    for (const seed of [100, 101, 102]) {
      const p = await t.play(a.link, 'minesweeper', 'benchmark');
      expect(p.first.body.seedCode).toBe(seedCodeOf('minesweeper', seed));
      expect(p.last.done).toBe(true);
    }
    const over = await start();
    expect(over.status).toBe(409);
    expect(over.body.error).toBe('benchmark complete for minesweeper');
    expect((await start('beams')).status).toBe(200);
    const repeats = t.db.all<{ seed: number }>('SELECT seed FROM runs WHERE entry = ? AND repeat = 1 ORDER BY n', a.entryId);
    expect(repeats.map((r) => r.seed)).toEqual([100, 101, 102]);
  });

  it('keeps drawing fresh seeds while the interval is wide, up to 30, then repeats', async () => {
    const a = await t.register(ai('wide')), start = () => t.send('POST', '/sessions', { game: 'minesweeper', mode: 'benchmark' }, a.link);
    for (let i = 0; i < 10; i++) seedRun(a.entryId, 'minesweeper', 300 + i, 0, i % 2);
    const next = await start();
    expect(Array.from({ length: 10 }, (_, i) => 300 + i)).not.toContain(parseSeedCode(next.body.seedCode)!.seed);
    for (let i = 10; i < 28; i++) seedRun(a.entryId, 'minesweeper', 300 + i, 0, i % 2);
    const last = await start();
    expect(Array.from({ length: 28 }, (_, i) => 300 + i)).not.toContain(parseSeedCode(last.body.seedCode)!.seed);
    expect(parseSeedCode((await start()).body.seedCode)!.seed).toBe(300);
  });

  it('reports a zero retest spread when repeats match', async () => {
    const a = await t.register(ai('steady'));
    for (let s = 1; s <= 10; s++) seedRun(a.entryId, 'minesweeper', s, 0, 0.4);
    for (let s = 1; s <= 3; s++) seedRun(a.entryId, 'minesweeper', s, 1, 0.4);
    const row = (await t.send('GET', '/leaderboard?game=minesweeper')).body.rows.find((x: any) => x.entryId === a.entryId);
    expect(row).toMatchObject({ seeds: 10, retestSpread: 0, averaged: false, badge: 'registered' });
  });

  it('marks entries whose repeat runs disagree as averaged', async () => {
    const a = await t.register(ai('wobbly'));
    for (let s = 1; s <= 30; s++) seedRun(a.entryId, 'minesweeper', s, 0, 1);
    for (let s = 1; s <= 3; s++) seedRun(a.entryId, 'minesweeper', s, 1, 0);
    const row = (await t.send('GET', '/leaderboard?game=minesweeper')).body.rows.find((x: any) => x.entryId === a.entryId);
    expect(row.seeds).toBe(30);
    expect(row.retestSpread).toBeGreaterThan(0.03);
    expect(row.averaged).toBe(true);
  });

  it('needs the latency or token clock for real-time games', async () => {
    const a = await t.register(ai());
    expect((await t.send('POST', '/sessions', { game: 'dino', mode: 'benchmark', clock: 'none' }, a.link)).status).toBe(400);
    const s = await t.send('POST', '/sessions', { game: 'dino', mode: 'benchmark', clock: 'token' }, a.link);
    expect(s.status).toBe(200);
    const m = await t.send('POST', `/sessions/${s.body.session}/move`, { action: s.body.legalActions[0].id, tokensOut: 400 }, a.link);
    expect(m.body.step).toBeGreaterThan(40);
    expect((await t.send('POST', `/sessions/${s.body.session}/move`, { action: 'jump', tokensOut: -1 }, a.link)).status).toBe(400);
  });
});

describe('live watching', () => {
  const open = (body: object = {}, token?: string) => t.send('POST', '/sessions', { game: 'minesweeper', mode: 'practice', ...body }, token);

  it('streams a frame per step, forced and real-time default frames included, and ends with the stored run', async () => {
    for (const [game, extra, tokensOut] of [['sokoban', { seed: 1 }, undefined], ['dino', { seed: 2, clock: 'token' }, 160]] as const) {
      const s = await open({ game, ...extra });
      expect(s.body.watch).toMatch(/^[A-Za-z0-9_-]{16}$/);
      expect(s.body.watch).not.toBe(s.body.session);
      expect(s.body.watchUrl).toBe(`${ORIGIN}/arcadebench/watch/${s.body.watch}`);
      const res = await stream(s.body.watch);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(res.headers.get('x-accel-buffering')).toBe('no');
      const got = collect(res);
      let o = s.body;
      while (!o.done) o = (await t.send('POST', `/sessions/${o.session}/move`, { action: o.legalActions[0].id, tokensOut })).body;
      const all = await got, final = all.at(-1), steps = all.slice(0, -1);
      expect(all[0]).toMatchObject({ watch: s.body.watch, game, step: s.body.step, done: false, mode: 'practice', entry: null, last: null, regrets: [], seedCode: s.body.seedCode });
      steps.forEach((f, i) => i && expect(f.step).toBe(steps[i - 1].step + 1));
      expect(steps.at(-1).step).toBe(o.step);
      expect(final).toMatchObject({ done: true, step: o.step, score: o.score });
      expect(steps.every((f) => !f.done && !f.runId)).toBe(true);
      const run = (await t.send('GET', `/runs/${final.runId}`)).body, real = run.decisions.filter((d: any) => !d.forced);
      expect(run.steps).toBe(final.step);
      expect(final.regrets).toEqual(real.map((d: any) => d.regret).slice(-600));
      expect(final.last).toEqual({ step: real.at(-1).step, action: real.at(-1).action, expert: real.at(-1).expert, regret: real.at(-1).regret, agree: real.at(-1).agree, invalid: real.at(-1).invalid, latencyMs: real.at(-1).latencyMs });
      expect(typeof final.last.latencyMs).toBe('number');
      expect(typeof final.medianMs).toBe('number');
      expect(run.decisions.some((d: any) => d.forced) || game === 'dino').toBe(true);
      expect(JSON.stringify(all)).not.toContain(s.body.session);
      expect((await t.send('GET', `/watch/${s.body.watch}`)).body).toEqual({ ...final, actions: run.actions });
    }
  });

  it('sends heartbeats', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const s = await open(), read = (await stream(s.body.watch)).body!.getReader();
      expect((await read.read()).value).toBeTruthy();
      vi.advanceTimersByTime(15_000);
      expect(new TextDecoder().decode((await read.read()).value)).toBe(': hb\n\n');
      await read.cancel();
    } finally { vi.useRealTimers(); }
  });

  it('lists active sessions newest first without private ids, tokens or hidden entries', async () => {
    const a = await t.register(ai('listed-bot')), u = await t.register(ai('hidden-bot', 'unlisted'));
    const s1 = await open({ seed: 1 }), s2 = await t.send('POST', '/sessions', { game: 'minesweeper', mode: 'benchmark' }, a.link), s3 = await open({ seed: 3 }, u.link);
    const list = await t.send('GET', '/live');
    expect(list.status).toBe(200);
    expect(list.headers.get('access-control-allow-origin')).toBe('*');
    expect(list.body.map((x: any) => x.watch)).toEqual([s3, s2, s1].map((s) => s.body.watch));
    expect(list.body.map((x: any) => x.entry)).toEqual([null, { name: 'listed-bot', x: 'bot_one' }, null]);
    expect(list.body.map((x: any) => x.mode)).toEqual(['practice', 'benchmark', 'practice']);
    expect(Object.keys(list.body[0]).sort()).toEqual(['entry', 'game', 'mode', 'score', 'seedCode', 'startedAt', 'step', 'watch']);
    const everything = list.text + (await t.send('GET', `/watch/${s2.body.watch}`)).text + (await t.send('GET', `/watch/${s3.body.watch}`)).text;
    for (const secret of [s1, s2, s3].map((s) => s.body.session).concat([a.link, u.link, a.entryId, u.entryId, 'example.com', 'hidden-bot'])) expect(everything).not.toContain(secret);
    let o = s1.body;
    while (!o.done) o = (await t.send('POST', `/sessions/${o.session}/move`, { action: o.legalActions[0].id })).body;
    expect((await t.send('GET', '/live')).body.map((x: any) => x.watch)).toEqual([s3, s2].map((s) => s.body.watch));
  });

  it('shows at most 50 sessions', async () => {
    const made: string[] = [];
    for (let i = 0; i < 7; i++) {
      const e = await t.register(ai(`m${i}`));
      for (let j = 0; j < LIMITS.maxOpenSessionsPerToken; j++) made.push((await open({ seed: j }, e.link)).body.watch);
    }
    const list = (await t.send('GET', '/live')).body;
    expect(list).toHaveLength(50);
    expect(list[0].watch).toBe(made.at(-1));
  });

  it('never accepts moves, or reads, through the public watch id', async () => {
    const a = await t.register(ai('own')), s = await open({}, a.link), anon = await open();
    for (const [w, token] of [[s.body.watch, a.link], [s.body.watch, undefined], [anon.body.watch, undefined]] as const) {
      expect((await t.send('POST', `/sessions/${w}/move`, { action: s.body.legalActions[0].id }, token)).status).toBe(404);
      expect((await t.send('GET', `/sessions/${w}`, undefined, token)).status).toBe(404);
    }
    expect((await t.send('POST', `/sessions/${anon.body.session}/move`, { action: anon.body.legalActions[0].id })).status).toBe(200);
  });

  it('keeps finished sessions watchable for 10 minutes, then points to the run', async () => {
    const p = await t.play(undefined, 'minesweeper', 'practice', { seed: 4 }), w = p.first.body.watch;
    const final = (await t.send('GET', `/watch/${w}`)).body;
    expect(final).toMatchObject({ done: true, step: p.last.step });
    expect(typeof final.runId).toBe('string');
    const { actions, ...frame } = final;
    expect(actions).toHaveLength(p.last.step);
    expect(await collect(await stream(w))).toEqual([frame]);
    t.clock.t += 9 * 60_000;
    t.sweep();
    expect((await t.send('GET', `/watch/${w}`)).status).toBe(200);
    t.clock.t += 2 * 60_000;
    t.sweep();
    const gone = await t.send('GET', `/watch/${w}`);
    expect(gone.status).toBe(404);
    expect(gone.body.runId).toBe(final.runId);
    expect((await stream(w)).status).toBe(404);
    expect((await t.send('GET', '/watch/nope')).body).toEqual({ error: 'unknown or expired watch id' });
  });

  it('limits concurrent streams per address', async () => {
    const s = await open(), res: Response[] = [];
    for (let i = 0; i < 8; i++) res.push(await stream(s.body.watch));
    expect(res.every((r) => r.status === 200)).toBe(true);
    const over = await stream(s.body.watch);
    expect(over.status).toBe(429);
    await res[0].body!.cancel();
    const again = await stream(s.body.watch);
    expect(again.status).toBe(200);
    for (const r of [...res.slice(1), again]) await r.body!.cancel();
  });
});

describe('migration', () => {
  it('drops seasons and hidden seeds but keeps every run and entry', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'abdb-')), 'old.db'), old = new DatabaseSync(file);
    old.exec(MIGRATIONS[0]);
    old.exec('PRAGMA user_version = 1');
    old.exec(`INSERT INTO entries VALUES ('e1', 'tok', 'ai', 'x', 'a@b.c', NULL, 'listed', 'm', 'tool', 'llm', 1, NULL, 0, 'now');
      INSERT INTO seasons VALUES ('S01', 'a', 'b', '{}', 's', 'c'); INSERT INTO quota VALUES ('e1', 'S01', 'beams', 3);
      INSERT INTO runs (id, entry, season, game, version, seed, repeat, track, help, cap, ranked, score, norm, steps, agree, dec, truncated, created, ep) VALUES ('r1', 'e1', 'S01', 'beams', '1', 7, 0, 'turn', 1, 64, 1, 5, 0.5, 3, 1, 2, 0, 'now', x'00');`);
    old.close();
    const db = openDb(file);
    expect(db.get('SELECT id, seed, bench, norm FROM runs')).toMatchObject({ id: 'r1', seed: 7, bench: 1, norm: 0.5 });
    expect(db.get('SELECT id FROM entries')).toMatchObject({ id: 'e1' });
    expect(db.all<{ name: string }>('PRAGMA table_info(runs)').map((c) => c.name)).not.toContain('season');
    expect(db.all('SELECT name FROM sqlite_master WHERE name IN (\'seasons\', \'quota\')')).toEqual([]);
    db.close();
  });
});

describe('run records', () => {
  it('index every decision into the full action list, forced and real-time frames included', async () => {
    const a = await t.register(ai('rec'));
    const p = await t.play(a.link, 'sokoban', 'practice', { seed: 1 });
    const id = (await t.send('GET', `/entries/${a.entryId}`, undefined, a.link)).body.runs[0].id;
    const run = (await t.send('GET', `/runs/${id}`, undefined, a.link)).body;
    expect(run.actions).toHaveLength(p.last.step);
    expect(run.decisions.some((d: any) => d.forced)).toBe(true);
    expect(run.decisions.every((d: any, k: number) => run.actions[d.step] === d.action && (k === 0 || d.step > run.decisions[k - 1].step))).toBe(true);
    const s = await t.send('POST', '/sessions', { game: 'dino', mode: 'practice', seed: 2, clock: 'token' }, a.link);
    const m = await t.send('POST', `/sessions/${s.body.session}/move`, { action: s.body.legalActions[0].id, tokensOut: 160 }, a.link);
    expect(m.body.step).toBeGreaterThan(20);
    t.clock.t += 31 * 60 * 1000;
    t.sweep();
    const dino = (await t.send('GET', `/entries/${a.entryId}`, undefined, a.link)).body.runs[0].id;
    const d = (await t.send('GET', `/runs/${dino}`, undefined, a.link)).body;
    expect(d.actions.length).toBeGreaterThan(d.decisions.length);
    expect(d.decisions.every((x: any) => x.step < d.actions.length)).toBe(true);
  });
});

describe('decision lab', () => {
  it.each(LAB.map((g) => g.id))('plays %s as a benchmark to the end and normalizes the score', async (game) => {
    const a = await t.register(ai(`lab-${game}`)), g = GAMES[game], chosen: string[] = [];
    const p = await t.play(a.link, game, 'benchmark', {}, (o) => { const x = expertAction(g, replay(g, parseSeedCode(o.seedCode)!.seed, chosen)); chosen.push(x); return x; });
    expect(p.first.body.legalActions.length).toBeGreaterThan(1);
    expect(p.last).toMatchObject({ done: true, score: 300, step: 300 });
    const run = await until(async () => { const r = t.db.get<{ norm: number | null; steps: number }>('SELECT norm, steps FROM runs WHERE entry = ?', a.entryId); return r?.norm != null && r; });
    expect(run).toMatchObject({ norm: 1, steps: 300 });
  });

  it('stays out of the overall board but has a board of its own', async () => {
    const a = await t.register(ai('labber'));
    for (let s = 1; s <= 10; s++) { seedRun(a.entryId, 'minesweeper', s, 0, 0.25); seedRun(a.entryId, 'sorter', s, 0, 0.75); }
    const iqm = (game: string) => until(async () => { t.clock.t += REFRESH_MS; return (await t.send('GET', `/leaderboard?game=${game}&track=turn&help=1`)).body.rows.find((r: any) => r.entryId === a.entryId)?.iqm; });
    expect(await iqm('overall')).toBe(0.25);
    expect(await iqm('sorter')).toBe(0.75);
  });
});

describe('episode caps', () => {
  it('ignores runs stored under another cap in standings and in adaptive stopping', async () => {
    const a = await t.register(ai('old-cap'));
    for (let i = 0; i < 10; i++) seedRun(a.entryId, 'minesweeper', 100 + i, 0, 0.5, CAPS.minesweeper - 1);
    const next = await t.send('POST', '/sessions', { game: 'minesweeper', mode: 'benchmark' }, a.link);
    expect(Array.from({ length: 10 }, (_, i) => 100 + i)).not.toContain(parseSeedCode(next.body.seedCode)!.seed);
    expect(t.db.all('SELECT 1 FROM runs WHERE entry = ? AND repeat = 1', a.entryId)).toHaveLength(0);
    t.clock.t += REFRESH_MS;
    const board = (await t.send('GET', '/leaderboard?game=minesweeper&track=turn&help=1')).body;
    expect(board.rows.map((r: any) => r.entryId)).not.toContain(a.entryId);
  });
});

describe('run listing', () => {
  it('lists every run of listed entries newest first, with cached official baselines', async () => {
    const pub = await t.register(ai('lister')), priv = await t.register(ai('hider', 'unlisted'));
    await t.play(pub.link, 'minesweeper', 'practice', { seed: 9 });
    await t.play(priv.link, 'minesweeper', 'practice', { seed: 9 });
    await t.play(undefined, 'minesweeper', 'practice', { seed: 9 });
    await t.play(pub.link, 'minesweeper', 'benchmark');
    const list = async (q: string) => (await t.send('GET', `/runs?game=minesweeper${q}`)).body;
    expect((await list('&seed=9')).map((r: any) => r.entry.name)).toEqual(['lister']);
    await t.send('POST', '/practice/verify', { game: 'minesweeper', seedCode: seedCodeOf('minesweeper', 9), actions: [] });
    const withRefs = await list('&seed=9');
    expect(withRefs.map((r: any) => r.entry.name)).toEqual(['expert', 'random', 'lister']);
    expect(withRefs[0]).toMatchObject({ entry: { badge: 'official' }, normalized: 1, seedCode: seedCodeOf('minesweeper', 9) });
    expect(withRefs[2]).not.toHaveProperty('decisions');
    expect(withRefs[2]).toMatchObject({ track: 'turn', help: 1, game: 'minesweeper' });
    expect(await list('')).toHaveLength(2);
    expect(await list('&limit=1')).toHaveLength(1);
    for (const q of ['?game=nope', '?game=minesweeper&seed=x', '?game=minesweeper&limit=0', '?game=minesweeper&limit=101']) expect((await t.send('GET', `/runs${q}`)).status).toBe(400);
  });
});

describe('leaderboard', () => {
  it('lists listed entries with the official rows and keeps unlisted ones private', async () => {
    const pub = await t.register(ai('public-bot')), priv = await t.register(ai('private-bot', 'unlisted'));
    for (const e of [pub, priv]) for (let i = 0; i < 2; i++) await t.play(e.link, 'minesweeper', 'benchmark');
    const board = await until(async () => {
      t.clock.t += REFRESH_MS;
      const b = (await t.send('GET', '/leaderboard?game=minesweeper&track=turn&help=1')).body;
      return b.rows.some((r: any) => r.entryId === pub.entryId) && b;
    });
    expect(board.rows.map((r: any) => r.entryId)).not.toContain(priv.entryId);
    expect(board.rows.find((r: any) => r.entryId === 'expert')).toMatchObject({ badge: 'official', iqm: 1 });
    expect(board.rows.find((r: any) => r.entryId === 'random')).toMatchObject({ badge: 'official', iqm: 0 });
    const row = board.rows.find((r: any) => r.entryId === pub.entryId);
    expect(row).toMatchObject({ name: 'public-bot', x: 'bot_one', agentType: 'llm', help: 1, track: 'turn' });
    expect(row.lo).toBeLessThanOrEqual(row.iqm);
    expect(row.rank[0]).toBeGreaterThanOrEqual(1);
    expect(row.group).toBeGreaterThanOrEqual(1);
    expect(board.help).toBe(1);
    expect((await t.send('GET', '/leaderboard?help=0')).body.rows.map((r: any) => r.entryId)).not.toContain(pub.entryId);
    const overall = (await t.send('GET', '/leaderboard')).body;
    expect(overall.game).toBe('overall');
    expect(overall.rows.map((r: any) => r.entryId)).toContain(pub.entryId);
    expect((await t.send('GET', `/entries/${priv.entryId}`)).status).toBe(404);
    expect((await t.send('GET', `/entries/${priv.entryId}`, undefined, pub.link)).status).toBe(404);
    const own = await until(async () => { t.clock.t += REFRESH_MS; const c = (await t.send('GET', `/entries/${priv.entryId}`, undefined, priv.link)).body; return c.rows.length && c; });
    expect(own).toMatchObject({ listing: 'unlisted', name: 'private-bot', mode: 'tool' });
    expect(own.runs).toHaveLength(2);
    const privRun = own.runs[0].id;
    expect((await t.send('GET', `/runs/${privRun}`)).status).toBe(404);
    expect((await t.send('GET', `/runs/${privRun}`, undefined, priv.link)).status).toBe(200);
    expect((await t.send('GET', '/leaderboard?track=bogus')).status).toBe(400);
    expect((await t.send('GET', '/leaderboard?game=bogus')).status).toBe(400);
  });
});

describe('mcp over http', () => {
  it('runs the initialize, list and call flow on a shared session core', async () => {
    const a = await t.register(ai('mcp-bot')), url = `/arcadebench/mcp/${a.link}`;
    const rpc = async (method: string, params?: object, id: number | undefined = 1) => (await t.send('POST', url, { jsonrpc: '2.0', id, method, params })).body;
    const call = async (name: string, args: object = {}) => { const r = (await rpc('tools/call', { name, arguments: args })).result; return { isError: r.isError, text: r.content[0].text as string }; };
    expect((await rpc('initialize', { protocolVersion: '2025-06-18' })).result.capabilities.tools).toBeDefined();
    expect((await t.send('POST', url, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    expect((await rpc('ping')).result).toEqual({});
    expect((await rpc('tools/list')).result.tools.map((x: any) => x.name)).toEqual(['list_games', 'start_game', 'observe', 'make_move', 'game_status', 'get_scorecard']);
    expect((await rpc('nope')).error.code).toBe(-32601);
    expect(JSON.parse((await call('list_games')).text)).toHaveLength(Object.keys(GAMES).length);
    expect((await call('start_game', { game: 'nope', mode: 'practice' })).isError).toBe(true);
    expect((await rpc('tools/list')).result.tools.find((x: any) => x.name === 'start_game').description).toContain('watchUrl');
    const v = JSON.parse((await call('start_game', { game: 'minesweeper', mode: 'practice', seed: 3 })).text);
    expect(v.legalActions.length).toBeGreaterThan(1);
    expect(v.watchUrl).toMatch(new RegExp(`^${ORIGIN}/arcadebench/watch/[A-Za-z0-9_-]{16}$`));
    expect(v.share).toContain('watchUrl');
    expect(v).not.toHaveProperty('watch');
    const bad = await call('make_move', { session: v.session, action: 'teleport' });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain(v.legalActions[0].id);
    let o = v;
    while (!o.done) o = JSON.parse((await call('make_move', { session: o.session, action: o.legalActions[0].id })).text);
    expect(JSON.parse((await call('game_status', { session: o.session })).text)).toMatchObject({ done: true, invalidMoves: 1 });
    expect(JSON.parse((await call('observe', { session: o.session })).text).done).toBe(true);
    const bench = JSON.parse((await call('start_game', { game: 'minesweeper', mode: 'benchmark' })).text);
    expect(parseSeedCode(bench.seedCode)?.game).toBe('minesweeper');
    expect(JSON.parse((await call('get_scorecard')).text).entryId).toBe(a.entryId);
    expect((await t.send('GET', `/sessions/${bench.session}`, undefined, a.link)).body.step).toBe(0);
  });

  it('rejects bad tokens, batches and wrong methods', async () => {
    const a = await t.register(ai());
    expect((await t.send('POST', '/arcadebench/mcp/wrong', { jsonrpc: '2.0', id: 1, method: 'ping' })).status).toBe(401);
    expect((await t.send('POST', `/arcadebench/mcp/${a.link}`, [{ jsonrpc: '2.0', id: 1, method: 'ping' }])).body.error.code).toBe(-32600);
    const garbage = await t.app.request(`/arcadebench/mcp/${a.link}`, { method: 'POST', body: '{' });
    expect(garbage.status).toBe(400);
    expect((await t.send('GET', `/arcadebench/mcp/${a.link}`)).status).toBe(405);
  });
});

describe('site', () => {
  it('serves games, health and the web build with SPA fallback and long-cache assets', async () => {
    const h = await t.send('GET', '/health');
    expect(h.body).toMatchObject({ ok: true });
    expect(typeof h.body.version).toBe('string');
    const games = (await t.send('GET', '/games')).body;
    expect(games).toHaveLength(Object.keys(GAMES).length);
    expect(games.find((g: any) => g.id === 'sorter')).toMatchObject({ prefix: 'SRT', cap: 300, original: false, ask: 'Is this SMS spam?' });
    expect(games.find((g: any) => g.id === 'tetris')).not.toHaveProperty('ask');
    expect(games.find((g: any) => g.id === 'dino')).toMatchObject({ prefix: expect.any(String), cap: 6000, original: false, realtime: { framesPerStep: expect.any(Number) } });
    expect(games.find((g: any) => g.id === 'courier').original).toBe(true);
    expect((await t.send('GET', '/arcadebench/leaderboard')).text).toContain('<title>ab</title>');
    const asset = await t.send('GET', '/arcadebench/assets/app.abc123.js');
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect(h.headers.get('cache-control')).toBe('no-store');
    expect((await t.send('GET', '/arcadebench/')).headers.get('cache-control')).toBe('no-cache');
    expect((await t.send('GET', '/arcadebench/api/v1/nope')).body).toEqual({ error: 'not found' });
    expect((await t.send('GET', '/arcadebench/%2e%2e/%2e%2e/etc/passwd')).text).not.toContain('root:');
    expect((await t.send('GET', '/t/v')).status).toBe(404);
  });
});
