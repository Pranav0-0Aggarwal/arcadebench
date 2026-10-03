import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIMITS } from '@arcadebench/api';
import { GAMES, parseSeedCode, seedCodeOf } from '@arcadebench/engine';
import { ai, human, ORIGIN, setup, until } from './harness.ts';
import { canon, sha256 } from './util.ts';

let t: ReturnType<typeof setup>;
beforeEach(() => { t = setup(); });
afterEach(() => t.close());

const season = async () => (await t.send('GET', '/seasons/current')).body;
const closeSeason = async () => { t.clock.t = Date.parse((await season()).closes) + 1000; };

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
  it('needs a valid token for ranked play, and sessions belong to their owner', async () => {
    expect((await t.send('POST', '/sessions', { game: 'beams', mode: 'ranked' })).status).toBe(401);
    expect((await t.send('POST', '/sessions', { game: 'beams', mode: 'ranked' }, 'not-a-token')).status).toBe(401);
    const a = await t.register(ai('a')), b = await t.register(ai('b'));
    const s = await t.send('POST', '/sessions', { game: 'beams', mode: 'practice', seed: 1 }, a.link);
    expect(s.status).toBe(200);
    expect((await t.send('GET', `/sessions/${s.body.session}`, undefined, a.link)).status).toBe(200);
    expect((await t.send('GET', `/sessions/${s.body.session}`, undefined, b.link)).status).toBe(404);
    expect((await t.send('GET', `/sessions/${s.body.session}`)).status).toBe(404);
    expect((await t.send('POST', `/sessions/${s.body.session}/move`, { action: 'flip0' })).status).toBe(404);
    const h = await t.register(human);
    expect((await t.send('POST', '/sessions', { game: 'beams', mode: 'ranked' }, h.link)).status).toBe(403);
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
    const p = await t.play(undefined, 'tetris', 'practice', { seed: 5 });
    expect(p.last.step).toBeGreaterThan(p.chosen.length);
    const v = await t.send('POST', '/practice/verify', { game: 'tetris', seedCode: seedCodeOf('tetris', 5), actions: p.chosen });
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

describe('ranked', () => {
  it('follows the season order, hides seeds until close and commits to them', async () => {
    const a = await t.register(ai('ranked-bot'));
    const before = await season();
    expect(before.revealed).toBeUndefined();
    expect(before.salt).toBeUndefined();
    expect(before.id).toBe('S01');
    expect(before.seedsPerGame).toBe(30);
    for (let i = 0; i < 3; i++) {
      const p = await t.play(a.link, 'minesweeper', 'ranked');
      expect(p.first.body.seedCode).toBeNull();
      expect(p.last.seedCode).toBeNull();
      expect(JSON.stringify(p.first.body)).not.toContain('seed"');
    }
    const card = (await t.send('GET', `/entries/${a.entryId}`, undefined, a.link)).body;
    expect(card.runs.map((r: any) => r.seedCode)).toEqual(['', '', '']);
    const runId = card.runs[0].id, hidden = (await t.send('GET', `/runs/${runId}`, undefined, a.link)).body;
    expect(hidden.seedCode).toBe('');
    expect(hidden.actions).toEqual([]);
    expect(hidden.decisions).toEqual([]);
    expect((await t.send('POST', '/sessions', { game: 'minesweeper', mode: 'ranked', help: 2 }, a.link)).status).toBe(400);
    await closeSeason();
    const closed = (await t.send('GET', '/seasons/S01')).body;
    expect(closed.commitment).toBe(sha256(canon({ salt: closed.salt, seeds: closed.revealed })));
    expect(closed.commitment).toBe(before.commitment);
    expect(closed.revealed.minesweeper).toHaveLength(30);
    const after = (await t.send('GET', `/entries/${a.entryId}`, undefined, a.link)).body;
    expect(after.runs.map((r: any) => r.seedCode).reverse()).toEqual(closed.revealed.minesweeper.slice(0, 3).map((s: number) => seedCodeOf('minesweeper', s)));
    expect((await t.send('GET', `/runs/${runId}`)).body.decisions.length).toBeGreaterThan(0);
    expect((await season()).id).toBe('S02');
  });

  it('serves 30 seeds then 3 repeats, then 409, and reports the retest spread', async () => {
    const a = await t.register(ai('quota-bot'));
    for (let i = 0; i < 33; i++) expect((await t.play(a.link, 'minesweeper', 'ranked')).last.done).toBe(true);
    const over = await t.send('POST', '/sessions', { game: 'minesweeper', mode: 'ranked' }, a.link);
    expect(over.status).toBe(409);
    expect(over.body.error).toContain('minesweeper');
    expect((await t.send('POST', '/sessions', { game: 'beams', mode: 'ranked' }, a.link)).status).toBe(200);
    const row = await until(async () => {
      const r = (await t.send('GET', '/leaderboard?game=minesweeper')).body.rows.find((x: any) => x.entryId === a.entryId);
      return r?.seeds >= 28 && r.retestSpread !== null && r;
    });
    expect(row.retestSpread).toBe(0);
    expect(row.averaged).toBe(false);
    expect(row.badge).toBe('registered');
  });

  it('marks entries whose repeat runs disagree as averaged', async () => {
    const a = await t.register(ai('wobbly')), sid = (await season()).id;
    const run = (seed: number, repeat: number, score: number) => t.save({ entry: a.entryId, season: sid, game: 'minesweeper', seed, repeat, track: 'turn', help: 1, cap: 216, ranked: true, score, steps: 0, truncated: false, decisions: [], actions: [] });
    for (let s = 1; s <= 30; s++) run(s, 0, 100);
    for (let s = 1; s <= 3; s++) run(s, 1, 0);
    const row = await until(async () => {
      const r = (await t.send('GET', '/leaderboard?game=minesweeper')).body.rows.find((x: any) => x.entryId === a.entryId);
      return r?.seeds === 30 && r;
    });
    expect(row.retestSpread).toBeGreaterThan(0.03);
    expect(row.averaged).toBe(true);
  });

  it('needs the latency or token clock for real-time games', async () => {
    const a = await t.register(ai());
    expect((await t.send('POST', '/sessions', { game: 'dino', mode: 'ranked', clock: 'none' }, a.link)).status).toBe(400);
    const s = await t.send('POST', '/sessions', { game: 'dino', mode: 'ranked', clock: 'token' }, a.link);
    expect(s.status).toBe(200);
    const m = await t.send('POST', `/sessions/${s.body.session}/move`, { action: s.body.legalActions[0].id, tokensOut: 400 }, a.link);
    expect(m.body.step).toBeGreaterThan(40);
    expect((await t.send('POST', `/sessions/${s.body.session}/move`, { action: 'jump', tokensOut: -1 }, a.link)).status).toBe(400);
  });
});

describe('run records', () => {
  it('index every decision into the full action list, forced and real-time frames included', async () => {
    const a = await t.register(ai('rec'));
    const p = await t.play(a.link, 'tetris', 'practice', { seed: 5 });
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

describe('run listing', () => {
  it('lists listed entries newest first, with cached official baselines, and never open-season ranked runs', async () => {
    const pub = await t.register(ai('lister')), priv = await t.register(ai('hider', 'unlisted'));
    await t.play(pub.link, 'minesweeper', 'practice', { seed: 9 });
    await t.play(priv.link, 'minesweeper', 'practice', { seed: 9 });
    await t.play(undefined, 'minesweeper', 'practice', { seed: 9 });
    await t.play(pub.link, 'minesweeper', 'ranked');
    const list = async (q: string) => (await t.send('GET', `/runs?game=minesweeper${q}`)).body;
    expect((await list('&seed=9')).map((r: any) => r.entry.name)).toEqual(['lister']);
    await t.send('POST', '/practice/verify', { game: 'minesweeper', seedCode: seedCodeOf('minesweeper', 9), actions: [] });
    const withRefs = await list('&seed=9');
    expect(withRefs.map((r: any) => r.entry.name)).toEqual(['expert', 'random', 'lister']);
    expect(withRefs[0]).toMatchObject({ entry: { badge: 'official' }, normalized: 1, seedCode: seedCodeOf('minesweeper', 9) });
    expect(withRefs[2]).not.toHaveProperty('decisions');
    expect(withRefs[2]).toMatchObject({ track: 'turn', help: 1, game: 'minesweeper' });
    expect(await list('')).toHaveLength(1);
    expect(await list('&limit=1')).toHaveLength(1);
    for (const q of ['?game=nope', '?game=minesweeper&seed=x', '?game=minesweeper&limit=0', '?game=minesweeper&limit=101']) expect((await t.send('GET', `/runs${q}`)).status).toBe(400);
  });
});

describe('leaderboard', () => {
  it('lists listed entries with the official rows and keeps unlisted ones private', async () => {
    const pub = await t.register(ai('public-bot')), priv = await t.register(ai('private-bot', 'unlisted'));
    for (const e of [pub, priv]) for (let i = 0; i < 2; i++) await t.play(e.link, 'minesweeper', 'ranked');
    const board = await until(async () => {
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
    const own = await until(async () => { const c = (await t.send('GET', `/entries/${priv.entryId}`, undefined, priv.link)).body; return c.rows.length && c; });
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
    const v = JSON.parse((await call('start_game', { game: 'minesweeper', mode: 'practice', seed: 3 })).text);
    expect(v.legalActions.length).toBeGreaterThan(1);
    const bad = await call('make_move', { session: v.session, action: 'teleport' });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain(v.legalActions[0].id);
    let o = v;
    while (!o.done) o = JSON.parse((await call('make_move', { session: o.session, action: o.legalActions[0].id })).text);
    expect(JSON.parse((await call('game_status', { session: o.session })).text)).toMatchObject({ done: true, invalidMoves: 1 });
    expect(JSON.parse((await call('observe', { session: o.session })).text).done).toBe(true);
    const ranked = JSON.parse((await call('start_game', { game: 'minesweeper', mode: 'ranked' })).text);
    expect(ranked.seedCode).toBeNull();
    expect(JSON.parse((await call('get_scorecard')).text).entryId).toBe(a.entryId);
    expect((await t.send('GET', `/sessions/${ranked.session}`, undefined, a.link)).body.step).toBe(0);
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
    expect(games).toHaveLength(11);
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
