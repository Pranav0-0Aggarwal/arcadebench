import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHESS } from '@arcadebench/api';
import { LEVELS } from '@arcadebench/engine';
import { ai, frames, human, setup, until } from './harness.ts';
import { sha256 } from './util.ts';

let t: ReturnType<typeof setup>;
beforeEach(() => { t = setup(); });
afterEach(() => t.close());

const seat = (token: string) => ({ 'x-seat': token });
const view = async (id: string, token?: string, bearer?: string) => (await t.send('GET', `/matches/${id}`, undefined, bearer, token ? seat(token) : {})).body;
const move = (id: string, mv: string, token?: string, bearer?: string) => t.send('POST', `/matches/${id}/move`, { move: mv }, bearer, token ? seat(token) : {});
const mate = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
async function duel() {
  const made = (await t.send('POST', '/matches', { white: 'human', black: 'human', me: 'white', name: 'Ada' })).body, id = made.match.id as string, w = made.token as string, b = made.seats.find((s: any) => s.color === 'black').token as string;
  return { id, w, b, made };
}
async function finished(id: string, token: string) { return until(async () => { const v = await view(id, token); return v.runId ? v : false; }); }

describe('creating and joining', () => {
  it('returns a seat token for me and an invite for each other open seat, never the computer', async () => {
    const r = await t.send('POST', '/matches', { white: 'human', black: 'human', me: 'white' });
    expect(r.status).toBe(200);
    expect(r.body.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(r.body.match).toMatchObject({ status: 'open', turn: 'white', you: 'white', fen: expect.stringContaining('rnbqkbnr') });
    expect(r.body.match.watchUrl).toBe(`https://bench.test/arcadebench/watch/${r.body.match.watch}`);
    const black = r.body.seats.find((s: any) => s.color === 'black');
    expect(black.invite).toBe(`https://bench.test/arcadebench/chess/${r.body.match.id}#${black.token}`);
    expect(r.body.seats.find((s: any) => s.color === 'white').token).toBeUndefined();
    const c = await t.send('POST', '/matches', { white: 'computer:2', black: 'agent' });
    expect(c.body.seats.find((s: any) => s.kind === 'computer')).toEqual({ color: 'white', kind: 'computer', level: 2 });
    expect(c.body.token).toBeUndefined();
  });

  it('keeps tokens out of everything stored or shown, and watch ids never control a seat', async () => {
    const { id, w, b, made } = await duel();
    await t.send('POST', `/matches/${id}/join`, { seat: b });
    const text = JSON.stringify([await view(id), (await t.send('GET', `/watch/${made.match.watch}`)).body]);
    for (const secret of [w, b, sha256(w), sha256(b)]) expect(text).not.toContain(secret);
    const stored = t.db.all<{ data: string }>('SELECT data FROM chess_live').map((r) => r.data).join('');
    expect(stored).toContain(sha256(w));
    expect(stored).not.toContain(w);
    expect(stored).not.toContain(b);
    expect((await move(id, 'e2e4', made.match.watch)).status).toBe(403);
    expect((await t.send('GET', `/matches/${id}`, undefined, undefined, seat(made.match.watch))).status).toBe(403);
  });

  it('starts when both seats are taken, and shows legal moves only to the seat on turn', async () => {
    const { id, w, b } = await duel();
    expect((await move(id, 'e2e4', w)).status).toBe(409);
    expect((await t.send('POST', `/matches/${id}/join`, { seat: 'x'.repeat(30) })).status).toBe(403);
    const joined = await t.send('POST', `/matches/${id}/join`, { seat: b, name: 'Bob' });
    expect(joined.body.match).toMatchObject({ status: 'live', you: 'black', white: { name: 'Ada' }, black: { name: 'Bob' } });
    expect(joined.body.match.legal).toBeUndefined();
    const mine = await view(id, w);
    expect(mine.legal).toHaveLength(20);
    expect(mine.legal[0]).toEqual({ id: expect.stringMatching(/^[a-h][1-8][a-h][1-8]$/), san: expect.any(String) });
    expect(mine.board).toContain('8 r n b q k b n r');
    expect((await view(id)).legal).toBeUndefined();
    expect((await t.send('POST', `/matches/${id}/join`, { seat: b })).status).toBe(200);
  });

  it('checks who may take which seat', async () => {
    const bot = await t.register(ai('bot')), person = await t.register(human);
    expect((await t.send('POST', '/matches', { white: 'agent', black: 'human', me: 'white' })).status).toBe(401);
    expect((await t.send('POST', '/matches', { white: 'human', black: 'human', me: 'white' }, bot.link)).status).toBe(403);
    expect((await t.send('POST', '/matches', { white: 'agent', black: 'agent', me: 'white' }, person.link)).status).toBe(403);
    expect((await t.send('POST', '/matches', { white: 'computer:1', black: 'agent', me: 'white' }, bot.link)).status).toBe(400);
    const r = await t.send('POST', '/matches', { white: 'agent', black: 'agent', me: 'white' }, bot.link);
    expect(r.status).toBe(200);
    const other = r.body.seats.find((s: any) => s.color === 'black');
    expect((await t.send('POST', `/matches/${r.body.match.id}/join`, { seat: other.token }, bot.link)).status).toBe(409);
    expect((await t.send('POST', `/matches/${r.body.match.id}/join`, { seat: other.token })).status).toBe(401);
    const rival = await t.register(ai('rival'));
    expect((await t.send('POST', `/matches/${r.body.match.id}/join`, { seat: other.token }, rival.link)).status).toBe(200);
    expect((await t.send('POST', `/matches/${r.body.match.id}/join`, { seat: other.token }, (await t.register(ai('third'))).link)).status).toBe(409);
  });

  it('validates the request', async () => {
    for (const b of [{}, { white: 'human' }, { white: 'robot', black: 'human' }, { white: 'computer:6', black: 'human' }, { white: 'computer:0', black: 'human' }, { white: 'human', black: 'human', me: 'green' }, { white: 'human', black: 'human', me: 'white', name: '' }, { white: 'human', black: 'human', me: 'white', name: 'x'.repeat(25) }, { white: 'computer:1', black: 'computer:1', me: 'white' }]) {
      expect((await t.send('POST', '/matches', b)).status, JSON.stringify(b)).toBe(400);
    }
    expect((await t.send('POST', '/matches', [1])).status).toBe(400);
    expect((await t.send('GET', '/matches/nope')).status).toBe(404);
  });

  it('limits open matches per owner and matches per hour', async () => {
    const codes: number[] = [];
    for (let i = 0; i < CHESS.openPerOwner + 1; i++) codes.push((await t.send('POST', '/matches', { white: 'human', black: 'human', me: 'white' })).status);
    expect(codes.slice(0, -1).every((c) => c === 200)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });
});

describe('playing', () => {
  it('rejects illegal moves, the wrong turn, bad notation and bad seat tokens', async () => {
    const { id, w, b } = await duel();
    await t.send('POST', `/matches/${id}/join`, { seat: b });
    const bad = await move(id, 'e2e5', w);
    expect(bad.status).toBe(422);
    expect(bad.body.error).toContain('e2e4');
    expect((await move(id, 'e7e5', b)).status).toBe(409);
    for (const mv of ['', 'E2E4', 'e2-e4', 'Nf3', 'e2e4x', 'e7e8k', 'e9e4']) expect((await move(id, mv, w)).status, mv).toBe(400);
    expect((await t.send('POST', `/matches/${id}/move`, { move: 'e2e4' })).status).toBe(401);
    expect((await move(id, 'e2e4', 'a'.repeat(32))).status).toBe(403);
    expect((await move(id, 'e2e4', `${w}x`)).status).toBe(403);
    const ok = await move(id, 'e2e4', w);
    expect(ok.status).toBe(200);
    expect(ok.body.match).toMatchObject({ turn: 'black', moves: ['e2e4'], sans: ['e4'] });
    expect((await move(id, 'e7e5', w)).status).toBe(409);
  });

  it('plays a game to checkmate, grades both sides, saves one run and answers after it ends', async () => {
    const { id, w, b, made } = await duel();
    await t.send('POST', `/matches/${id}/join`, { seat: b });
    const events = t.app.request(`/arcadebench/api/v1/watch/${made.match.watch}/stream`);
    const got: any[] = [];
    const reader = (async () => { for await (const f of frames(await events)) got.push(f); })();
    for (const [i, mv] of mate.entries()) expect((await move(id, mv, i % 2 ? b : w)).status).toBe(200);
    const done = await finished(id, w);
    expect(done).toMatchObject({ status: 'done', result: '0-1', why: 'checkmate', moves: mate, sans: ['f3', 'e5', 'g4', 'Qh4#'] });
    expect(done.grades.map((g: any) => g && g.tier)).toEqual([0, 0, 3, 0]);
    expect(done.accuracy[0]).toBeLessThan(done.accuracy[1]);
    await reader;
    expect(got.at(-1)).toMatchObject({ done: true, runId: done.runId, game: 'chess', mode: 'match', step: 4 });
    expect(got[0].match.status).toBe('live');
    expect(got.at(-1).data.say).toBe('Black wins · checkmate');
    expect((await move(id, 'a2a3', w)).status).toBe(409);
    const run = (await t.send('GET', `/runs/${done.runId}`)).body;
    expect(run).toMatchObject({ game: 'chess', track: 'match', actions: mate, steps: 4, score: 0, match: { result: '0-1', why: 'checkmate', white: { name: 'Ada' } } });
    expect(run.decisions.map((d: any) => d.regret > 5)).toEqual([false, false, true, false]);
    expect(t.db.all('SELECT * FROM runs WHERE game = ?', 'chess')).toHaveLength(1);
    expect(t.db.all('SELECT * FROM chess_live')).toHaveLength(0);
    const gone = await t.send('GET', `/watch/${made.match.watch}`);
    expect(gone.status).toBe(200);
  });

  it('plays a computer opponent and replies to every move', async () => {
    const r = await t.send('POST', '/matches', { white: 'human', black: 'computer:1', me: 'white' }), id = r.body.match.id as string, w = r.body.token as string;
    expect(r.body.match.status).toBe('live');
    expect((await move(id, 'e2e4', w)).status).toBe(200);
    const v = await until(async () => { const x = await view(id, w); return x.moves.length === 2 && x; });
    expect(v.turn).toBe('white');
    expect(v.black).toMatchObject({ kind: 'computer', level: 1, name: 'Computer level 1' });
    const black = (await t.send('POST', '/matches', { white: 'computer:1', black: 'human', me: 'black' })).body;
    const open = await until(async () => { const x = await view(black.match.id, black.token); return x.moves.length === 1 && x; });
    expect(open.turn).toBe('black');
    expect(open.legal.length).toBeGreaterThan(0);
  });

  it('lets two computers play each other', async () => {
    const r = await t.send('POST', '/matches', { white: 'computer:1', black: 'computer:2' });
    const v = await until(async () => { const x = await view(r.body.match.id); return x.moves.length >= 6 && x; });
    expect(v.grades.every((g: any) => g === null)).toBe(true);
    expect(v.white.elo).toBe(LEVELS[0].elo);
  });

  it('long-polls for the opponent and stops waiting on the seat to move', async () => {
    const { id, w, b } = await duel();
    await t.send('POST', `/matches/${id}/join`, { seat: b });
    expect((await t.send('GET', `/matches/${id}?wait=30`, undefined, undefined, seat(w))).status).toBe(400);
    const started = Date.now();
    expect((await t.send('GET', `/matches/${id}?wait=5`, undefined, undefined, seat(w))).body.turn).toBe('white');
    expect(Date.now() - started).toBeLessThan(1000);
    const waiting = t.send('GET', `/matches/${id}?wait=5`, undefined, undefined, seat(b));
    await move(id, 'e2e4', w);
    expect((await waiting).body.moves).toEqual(['e2e4']);
  });
});

describe('ending', () => {
  it('resigns', async () => {
    const { id, w, b } = await duel();
    await t.send('POST', `/matches/${id}/join`, { seat: b });
    await move(id, 'e2e4', w);
    expect((await t.send('POST', `/matches/${id}/resign`, {}, undefined, seat(w))).body.match).toMatchObject({ result: '0-1', why: 'resignation' });
    expect((await t.send('POST', `/matches/${id}/resign`, {}, undefined, seat(b))).status).toBe(409);
    expect((await finished(id, b)).runId).toBeTruthy();
  });

  it('offers, declines and accepts a draw, and the computer takes it only when it is worse', async () => {
    const { id, w, b } = await duel();
    await t.send('POST', `/matches/${id}/join`, { seat: b });
    const draw = (token: string, action?: string) => t.send('POST', `/matches/${id}/draw`, action ? { action } : {}, undefined, seat(token));
    expect((await draw(b, 'accept')).status).toBe(409);
    expect((await draw(w)).body.match.draw).toBe('white');
    expect((await view(id, b)).draw).toBe('white');
    expect((await draw(w, 'accept')).status).toBe(409);
    expect((await draw(b, 'decline')).body.match.draw).toBeNull();
    await draw(w);
    await move(id, 'e2e4', w);
    expect((await view(id, w)).draw).toBeNull();
    await draw(b);
    expect((await draw(w, 'accept')).body.match).toMatchObject({ result: '1/2-1/2', why: 'agreement' });
    expect((await t.send('POST', `/matches/${id}/draw`, { action: 'maybe' }, undefined, seat(w))).status).toBe(400);
    const vs = (await t.send('POST', '/matches', { white: 'human', black: 'computer:1', me: 'white' })).body;
    const asked = await t.send('POST', `/matches/${vs.match.id}/draw`, {}, undefined, seat(vs.token));
    expect(asked.body.match.result).toBeNull();
  });

  it('draws by repetition and stalemate rules and ends a stalled seat on the clock', async () => {
    const { id, w, b } = await duel();
    await t.send('POST', `/matches/${id}/join`, { seat: b });
    for (const [i, mv] of ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'].entries()) await move(id, mv, i % 2 ? b : w);
    expect((await finished(id, w))).toMatchObject({ result: '1/2-1/2', why: 'threefold' });
    const slow = await duel();
    await t.send('POST', `/matches/${slow.id}/join`, { seat: slow.b });
    await move(slow.id, 'e2e4', slow.w);
    t.clock.t += CHESS.moveMs - 1000;
    t.sweep();
    expect((await view(slow.id, slow.w)).status).toBe('live');
    expect((await view(slow.id, slow.w)).deadline).toBeTruthy();
    t.clock.t += 2000;
    t.sweep();
    expect(await finished(slow.id, slow.w)).toMatchObject({ result: '1-0', why: 'timeout' });
    const idle = await t.send('POST', '/matches', { white: 'human', black: 'human', me: 'white' });
    t.clock.t += CHESS.openMs + 1;
    t.sweep();
    expect((await t.send('GET', `/matches/${idle.body.match.id}`)).status).toBe(404);
  });
});

describe('ratings', () => {
  it('updates both entries in one go, anchors the computer, skips unrated opponents and lists the board', async () => {
    const a = await t.register(ai('alpha')), b = await t.register(ai('beta'));
    const made = (await t.send('POST', '/matches', { white: 'agent', black: 'agent', me: 'white' }, a.link)).body, id = made.match.id as string;
    await t.send('POST', `/matches/${id}/join`, { seat: made.seats.find((s: any) => s.color === 'black').token }, b.link);
    for (const [i, mv] of mate.entries()) expect((await move(id, mv, undefined, i % 2 ? b.link : a.link)).status).toBe(200);
    const v = await until(async () => { const x = await view(id, undefined, a.link); return x.runId ? x : false; });
    expect(v.you).toBe('white');
    const run = (await t.send('GET', `/runs/${v.runId}`)).body;
    expect(run.match.elo).toEqual([{ before: 1200, after: 1200 - CHESS.kProvisional / 2 }, { before: 1200, after: 1200 + CHESS.kProvisional / 2 }]);
    const rows = (await t.send('GET', '/chess/ratings')).body.rows;
    expect(rows.filter((r: any) => r.badge === 'official').map((r: any) => r.elo)).toEqual([...LEVELS.map((l) => l.elo)].reverse());
    expect(rows.find((r: any) => r.name === 'beta')).toMatchObject({ elo: 1224, games: 1, wins: 1, provisional: true, kind: 'ai' });
    expect(rows.find((r: any) => r.name === 'alpha')).toMatchObject({ elo: 1176, losses: 1, blunders: 1 });
    const vs = (await t.send('POST', '/matches', { white: 'agent', black: 'computer:1', me: 'white' }, a.link)).body;
    for (const mv of ['f2f3', 'g2g4']) { await move(vs.match.id, mv, undefined, a.link); await until(async () => (await view(vs.match.id, undefined, a.link)).turn === 'white'); }
    await t.send('POST', `/matches/${vs.match.id}/resign`, {}, a.link);
    await until(async () => (await view(vs.match.id, undefined, a.link)).runId);
    const after = (await t.send('GET', '/chess/ratings')).body.rows.find((r: any) => r.name === 'alpha');
    expect(after.games).toBe(2);
    expect(after.elo).toBeLessThan(1176);
    const anon = (await t.send('POST', '/matches', { white: 'agent', black: 'human', me: 'white' }, b.link)).body, guest = anon.seats.find((s: any) => s.color === 'black').token;
    await t.send('POST', `/matches/${anon.match.id}/join`, { seat: guest });
    await move(anon.match.id, 'f2f3', undefined, b.link);
    await move(anon.match.id, 'e7e5', guest);
    await t.send('POST', `/matches/${anon.match.id}/resign`, {}, b.link);
    await until(async () => (await view(anon.match.id, undefined, b.link)).runId);
    expect((await t.send('GET', '/chess/ratings')).body.rows.find((r: any) => r.name === 'beta').games).toBe(1);
  });

  it('hides unlisted entries and reports no rating for them', async () => {
    const quiet = await t.register(ai('quiet', 'unlisted'));
    const made = (await t.send('POST', '/matches', { white: 'agent', black: 'computer:1', me: 'white' }, quiet.link)).body;
    expect(made.match.white).toMatchObject({ name: 'Anonymous', elo: null });
    expect(made.match.white.x).toBeUndefined();
    for (const [i, mv] of ['f2f3', 'g2g4'].entries()) { await move(made.match.id, mv, undefined, quiet.link); await until(async () => (await view(made.match.id, undefined, quiet.link)).moves.length === 2 * (i + 1)); }
    await t.send('POST', `/matches/${made.match.id}/resign`, {}, quiet.link);
    await until(async () => (await view(made.match.id, undefined, quiet.link)).runId);
    expect((await t.send('GET', '/chess/ratings')).body.rows.some((r: any) => r.name === 'quiet')).toBe(false);
    expect((await t.send('GET', '/chess/ratings', undefined, quiet.link)).body.rows.some((r: any) => r.name === 'quiet')).toBe(true);
  });
});

describe('queue', () => {
  it('pairs the first two waiting players and gives each their own seat token', async () => {
    const a = await t.send('POST', '/queue', {});
    expect(a.body).toMatchObject({ status: 'waiting' });
    expect(a.body.ticket).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect((await t.send('GET', '/queue')).body).toEqual({ waiting: 1 });
    const poll = (ticket: string) => t.send('GET', '/queue', undefined, undefined, { 'x-ticket': ticket });
    expect((await poll(a.body.ticket)).body.status).toBe('waiting');
    const b = await t.send('POST', '/queue', { color: 'white', name: 'Zed' });
    expect(b.body).toMatchObject({ status: 'matched', color: 'white' });
    const first = (await poll(a.body.ticket)).body;
    expect(first).toMatchObject({ status: 'matched', color: 'black' });
    expect(first.match.match.id).toBe(b.body.match.match.id);
    expect(first.match.token).not.toBe(b.body.match.token);
    expect(first.match.match.status).toBe('live');
    expect((await move(first.match.match.id, 'e2e4', b.body.match.token)).status).toBe(200);
    expect((await move(first.match.match.id, 'e7e5', first.match.token)).status).toBe(200);
    expect((await t.send('GET', '/queue')).body).toEqual({ waiting: 0 });
  });

  it('respects colour wishes and never pairs an entry with itself', async () => {
    const bot = await t.register(ai('solo'));
    const w = await t.send('POST', '/queue', { color: 'white' });
    const second = await t.send('POST', '/queue', { color: 'white' });
    expect(second.body.status).toBe('waiting');
    const third = await t.send('POST', '/queue', { color: 'black' });
    expect(third.body).toMatchObject({ status: 'matched', color: 'black' });
    expect((await t.send('GET', '/queue', undefined, undefined, { 'x-ticket': w.body.ticket })).body).toMatchObject({ status: 'matched', color: 'white' });
    expect((await t.send('GET', '/queue', undefined, undefined, { 'x-ticket': second.body.ticket })).body.status).toBe('waiting');
    await t.send('DELETE', '/queue', undefined, undefined, { 'x-ticket': second.body.ticket });
    const a = await t.send('POST', '/queue', {}, bot.link);
    expect(a.body.status).toBe('waiting');
    expect((await t.send('POST', '/queue', {}, bot.link)).body).toMatchObject({ status: 'waiting', ticket: '' });
    expect((await t.send('GET', '/queue', undefined, bot.link)).body.status).toBe('waiting');
    const other = await t.register(ai('other'));
    const pair = await t.send('POST', '/queue', {}, other.link);
    expect(pair.body.status).toBe('matched');
    const mine = (await t.send('GET', '/queue', undefined, bot.link)).body;
    expect(mine.status).toBe('matched');
    expect((await view(mine.match.match.id, undefined, bot.link)).you).toBe(mine.color);
    expect([mine.match.match.white.kind, mine.match.match.black.kind]).toEqual(['agent', 'agent']);
  });

  it('falls back to the computer after the wait, expires old tickets, and can be left', async () => {
    const a = await t.send('POST', '/queue', { computer: { level: 2, after: 30 }, color: 'black' });
    expect(a.body.fallback).toBeTruthy();
    const poll = () => t.send('GET', '/queue', undefined, undefined, { 'x-ticket': a.body.ticket });
    expect((await poll()).body.status).toBe('waiting');
    t.clock.t += 31_000;
    const r = (await poll()).body;
    expect(r).toMatchObject({ status: 'matched', color: 'black' });
    expect(r.match.match.white).toMatchObject({ kind: 'computer', level: 2 });
    await until(async () => (await view(r.match.match.id, r.match.token)).moves.length === 1);
    const b = await t.send('POST', '/queue', {});
    t.clock.t += CHESS.queueMs + 1000;
    t.sweep();
    expect((await t.send('GET', '/queue', undefined, undefined, { 'x-ticket': b.body.ticket })).status).toBe(404);
    const c = await t.send('POST', '/queue', {});
    expect((await t.send('DELETE', '/queue', undefined, undefined, { 'x-ticket': c.body.ticket })).status).toBe(200);
    expect((await t.send('GET', '/queue', undefined, undefined, { 'x-ticket': c.body.ticket })).status).toBe(404);
    for (const body of [{ color: 'red' }, { computer: 3 }, { computer: { level: 9, after: 30 } }, { computer: { level: 2, after: 1 } }, { computer: { level: 2, after: 1e6 } }]) expect((await t.send('POST', '/queue', body)).status, JSON.stringify(body)).toBe(400);
    expect((await t.send('GET', '/queue', undefined, undefined, { 'x-ticket': 'nope' })).status).toBe(404);
  });
});

describe('limits', () => {
  it('limits queue requests per hour per address', async () => {
    const codes: number[] = [];
    for (let i = 0; i < CHESS.perHour + 1; i++) codes.push((await t.send('POST', '/queue', {})).status);
    expect(codes.slice(0, -1).every((c) => c === 200)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });
});

describe('watching', () => {
  it('lists live matches, serves a snapshot and stream, and survives a restart', async () => {
    t.close();
    const file = join(mkdtempSync(join(tmpdir(), 'abchess-')), 'ab.db');
    t = setup(undefined, file);
    const r = (await t.send('POST', '/matches', { white: 'human', black: 'computer:1', me: 'white', name: 'Ada' })).body;
    await move(r.match.id, 'e2e4', r.token);
    await until(async () => (await view(r.match.id, r.token)).moves.length === 2);
    const live = (await t.send('GET', '/live')).body;
    expect(live[0]).toMatchObject({ game: 'chess', mode: 'match', step: 2, match: { white: 'Ada', black: 'Computer level 1' } });
    const snap = (await t.send('GET', `/watch/${r.match.watch}`)).body;
    expect(snap).toMatchObject({ game: 'chess', done: false, step: 2, actions: expect.any(Array) });
    expect(snap.data.board).toHaveLength(8);
    expect(snap.data.fen).toBe((await view(r.match.id)).fen);
    expect((await t.send('GET', '/watch/unknown')).status).toBe(404);
    t.close();
    t = setup(undefined, file);
    const back = await view(r.match.id, r.token);
    expect(back).toMatchObject({ status: 'live', moves: expect.any(Array), you: 'white' });
    expect(back.moves.slice(0, 1)).toEqual(['e2e4']);
    expect((await move(r.match.id, back.legal[0].id, r.token)).status).toBe(200);
  });
});

describe('mcp chess tools', () => {
  const tool = async (link: string, name: string, args: object = {}) => {
    const r = (await t.send('POST', `/arcadebench/mcp/${link}`, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).body.result;
    return { isError: r.isError as boolean, json: (() => { try { return JSON.parse(r.content[0].text); } catch { return undefined; } })(), text: r.content[0].text as string };
  };

  it('plays a computer match: create, move, wait for the reply, resign', async () => {
    const a = await t.register(ai('mcp-chess'));
    const made = await tool(a.link, 'chess_join', { opponent: 'computer:1', color: 'white' });
    expect(made.json).toMatchObject({ status: 'live', you: 'white', turn: 'white', next: expect.stringContaining('chess_move'), black: { kind: 'computer', level: 1 } });
    expect(made.json.legal).toHaveLength(20);
    expect(made.json.board).toContain('8 r n b q k b n r');
    expect(made.json.grades).toBeUndefined();
    const id = made.json.id as string;
    expect((await tool(a.link, 'chess_move', { match: id, move: 'e2e5' })).isError).toBe(true);
    const moved = await tool(a.link, 'chess_move', { match: id, move: 'e2e4' });
    expect(moved.json.next).toContain('chess_state');
    const state = await until(async () => { const s = await tool(a.link, 'chess_state', { match: id, wait: 5 }); return s.json.turn === 'white' && s.json.sans.length === 2 && s.json; });
    expect(state.legal.length).toBeGreaterThan(0);
    expect((await tool(a.link, 'chess_resign', { match: id })).json).toMatchObject({ status: 'done', result: '0-1', why: 'resignation' });
    expect((await tool(a.link, 'chess_state', { match: 'nope' })).isError).toBe(true);
  });

  it('joins an invite, offers a draw and uses the queue with a computer fallback', async () => {
    const a = await t.register(ai('first')), b = await t.register(ai('second'));
    const made = await tool(a.link, 'chess_join', { opponent: 'agent', color: 'black' });
    expect(made.json).toMatchObject({ status: 'open', you: 'black', next: expect.stringContaining('waiting') });
    const invite = made.json.invites[0].invite as string;
    expect((await tool(b.link, 'chess_join', { invite: 'https://x/nothing' })).isError).toBe(true);
    const joined = await tool(b.link, 'chess_join', { invite });
    expect(joined.json).toMatchObject({ status: 'live', you: 'white', turn: 'white' });
    const id = made.json.id as string;
    expect((await tool(b.link, 'chess_resign', { match: id, draw: 'offer' })).json.draw).toBe('white');
    expect((await tool(a.link, 'chess_resign', { match: id, draw: 'accept' })).json).toMatchObject({ result: '1/2-1/2', why: 'agreement' });
    const c = await t.register(ai('third'));
    const wait = await tool(c.link, 'chess_join', { queue: true, computer_level: 1, after_seconds: 5 });
    expect(wait.json).toMatchObject({ status: 'waiting' });
    expect((await tool(c.link, 'chess_join', { queue: true })).json.status).toBe('waiting');
    t.clock.t += 6000;
    const now = await tool(c.link, 'chess_join', { queue: true });
    expect(now.json).toMatchObject({ status: 'live', you: expect.stringMatching(/white|black/) });
  });
});
