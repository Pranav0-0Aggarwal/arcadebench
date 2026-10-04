import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { LIMITS } from '@arcadebench/api';
import { GAMES, CAPS, parseSeedCode, seedCodeOf } from '@arcadebench/engine';
import { REFRESH_MS } from './board.ts';
import { MIGRATIONS, openDb } from './db.ts';
import { ai, human, setup, web } from './harness.ts';
import { MAX_OPEN, STARTS_PER_HOUR } from './sessions.ts';
import { rid } from './util.ts';
import { makePool } from './work.ts';

const GATEWAY = '172.18.0.1';
let open: ReturnType<typeof setup>[] = [];
const make = (...a: Parameters<typeof setup>) => { const t = setup(...a); open.push(t); return t; };
afterEach(() => { for (const t of open) t.close(); open = []; });
const tmpDb = () => join(mkdtempSync(join(tmpdir(), 'abdb-')), 'ab.db');

describe('client address', () => {
  it('trusts the proxy header from the docker gateway only, and buckets IPv6 by /64', async () => {
    const t = make();
    const reg = (fwd: string, peer = GATEWAY) => t.send('POST', '/register', {}, undefined, { 'x-forwarded-for': fwd }, peer);
    for (let i = 0; i < LIMITS.registerPerIpPerHour; i++) expect((await reg('203.0.113.7')).status).toBe(400);
    const over = await reg('203.0.113.7');
    expect(over.status).toBe(429);
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await reg('203.0.113.8')).status).toBe(400);
    expect((await reg('198.51.100.1, 203.0.113.7')).status).toBe(429);
    expect((await reg('203.0.113.7', '198.51.100.9')).status).toBe(400);
    for (let i = 0; i < LIMITS.registerPerIpPerHour; i++) await reg(`2001:db8:1:2::${i.toString(16)}`);
    expect((await reg('2001:db8:1:2:ffff::1')).status).toBe(429);
    expect((await reg('2001:db8:1:3::1')).status).toBe(400);
  });

  it('caps requests per address across tokens and routes', async () => {
    const t = make();
    let last;
    for (let i = 0; i <= 1200; i++) last = await t.send('GET', '/games', undefined, undefined, { 'x-forwarded-for': '203.0.113.9' }, GATEWAY);
    expect(last!.status).toBe(429);
    expect((await t.send('GET', '/games', undefined, undefined, { 'x-forwarded-for': '203.0.113.10' }, GATEWAY)).status).toBe(200);
  });
});

describe('capacity', () => {
  it('limits verification per address', async () => {
    const t = make(), body = { game: 'beams', seedCode: seedCodeOf('beams', 1), actions: [] };
    for (let i = 0; i < 30; i++) expect((await t.send('POST', '/practice/verify', body)).status).toBe(200);
    expect((await t.send('POST', '/practice/verify', body)).status).toBe(429);
  });

  it('limits game starts per owner per hour, counting refused benchmark starts', async () => {
    const t = make(), a = await t.register(ai('busy'));
    for (let s = 1; s <= 10; s++) for (const repeat of [0, 1]) if (!repeat || s <= 3) t.db.run('INSERT INTO runs (id, entry, game, version, seed, repeat, track, help, cap, bench, score, norm, steps, agree, dec, truncated, created, ep) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0.5, 0, 0, 0, 0, ?, ?)', rid(), a.entryId, 'beams', GAMES.beams.version, s, repeat, 'turn', 1, 64, 'now', new Uint8Array());
    const codes = new Set<number>();
    for (let i = 0; i < STARTS_PER_HOUR; i++) {
      if (i % 500 === 499) t.clock.t += 61_000;
      codes.add((await t.send('POST', '/sessions', { game: 'beams', mode: 'benchmark' }, a.link)).status);
    }
    expect([...codes]).toEqual([409]);
    expect((await t.send('POST', '/sessions', { game: 'beams', mode: 'practice' }, a.link)).status).toBe(429);
    t.clock.t += 3600_000;
    expect((await t.send('POST', '/sessions', { game: 'beams', mode: 'practice' }, a.link)).status).toBe(200);
  });

  it('caps open sessions server-wide', async () => {
    const t = make();
    const start = (i: number) => t.send('POST', '/sessions', { game: 'beams', mode: 'practice', seed: 1 }, undefined, { 'x-forwarded-for': `10.9.${i >> 3}.1` }, GATEWAY);
    for (let i = 0; i < MAX_OPEN; i++) expect((await start(i)).status).toBe(200);
    const r = await start(MAX_OPEN + 8);
    expect(r.status).toBe(503);
    expect(r.headers.get('retry-after')).toBeTruthy();
  });

  it('bounds the worker queue and kills jobs that run too long', async () => {
    const pool = makePool({ queue: 1, urgent: 1, timeoutMs: 1000 });
    try {
      const slow = pool.run('reference', 'connect4', 1, CAPS.connect4), queued = pool.run('reference', 'beams', 1, 64);
      await expect(pool.run('reference', 'beams', 2, 64)).rejects.toMatchObject({ status: 503 });
      const order: string[] = [], replay = pool.run('replay', 'beams', 1, [], 64).then((r) => { order.push('replay'); return r; });
      queued.then(() => order.push('reference'));
      await expect(pool.run('replay', 'beams', 2, [], 64)).rejects.toMatchObject({ status: 503 });
      await expect(slow).rejects.toThrow('timed out');
      expect(await replay).toMatchObject({ steps: 0 });
      expect((await queued).expert).toBeGreaterThanOrEqual((await queued).random);
      expect(order).toEqual(['replay', 'reference']);
    } finally { pool.close(); }
  });
});

describe('moves', () => {
  it('ignores a retried move whose step is stale instead of playing it twice', async () => {
    const t = make(), s = (await t.send('POST', '/sessions', { game: 'sokoban', mode: 'practice', seed: 3 })).body;
    const a = s.legalActions[0].id, first = await t.send('POST', `/sessions/${s.session}/move`, { action: a, step: s.step });
    const again = await t.send('POST', `/sessions/${s.session}/move`, { action: a, step: s.step });
    expect(again.body.step).toBe(first.body.step);
    expect(again.body.state).toBe(first.body.state);
    expect((await t.send('POST', `/sessions/${s.session}/move`, { action: a, step: -1 })).status).toBe(400);
    expect((await t.send('POST', `/sessions/${s.session}/move`, { action: a, step: first.body.step })).body.step).toBe(first.body.step + 1);
  });

  it('keeps benchmark budgets per clock for real-time games', async () => {
    const t = make(), a = await t.register(ai('rt'));
    for (let s = 1; s <= 10; s++) t.db.run('INSERT INTO runs (id, entry, game, version, seed, repeat, track, help, cap, bench, score, norm, steps, agree, dec, truncated, created, ep) VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?, 1, 0, 0.5, 0, 0, 0, 0, ?, ?)', rid(), a.entryId, 'dino', GAMES.dino.version, s, 'latency', 6000, 'now', new Uint8Array());
    const latency = await t.send('POST', '/sessions', { game: 'dino', mode: 'benchmark', clock: 'latency' }, a.link);
    expect(parseSeedCode(latency.body.seedCode)!.seed).toBe(1);
    const token = await t.send('POST', '/sessions', { game: 'dino', mode: 'benchmark', clock: 'token' }, a.link);
    expect(parseSeedCode(token.body.seedCode)!.seed).not.toBeLessThanOrEqual(10);
  });
});

describe('restarts', () => {
  it('restores open sessions after a restart so games continue where they stopped', async () => {
    const file = tmpDb(), clock = { t: Date.now() };
    const t1 = setup(clock, file), a = await t1.register(ai('steady'));
    const bench = (await t1.send('POST', '/sessions', { game: 'beams', mode: 'benchmark' }, a.link)).body;
    const anon = (await t1.send('POST', '/sessions', { game: 'snake', mode: 'practice', seed: 4 })).body;
    const moved = (await t1.send('POST', `/sessions/${bench.session}/move`, { action: bench.legalActions[0].id }, a.link)).body;
    t1.close();
    const t2 = make(clock, file);
    expect((await t2.send('GET', `/sessions/${bench.session}`, undefined, a.link)).body).toMatchObject({ step: moved.step, state: moved.state, seedCode: bench.seedCode });
    expect((await t2.send('GET', `/sessions/${bench.session}`)).status).toBe(404);
    expect((await t2.send('GET', `/watch/${bench.watch}`)).body.step).toBe(moved.step);
    let o = (await t2.send('GET', `/sessions/${bench.session}`, undefined, a.link)).body;
    const played = [bench.legalActions[0].id];
    while (!o.done) { played.push(o.legalActions[0].id); o = (await t2.send('POST', `/sessions/${o.session}/move`, { action: o.legalActions[0].id }, a.link)).body; }
    const card = (await t2.send('GET', `/entries/${a.entryId}`, undefined, a.link)).body;
    expect(card.runs).toHaveLength(1);
    const run = (await t2.send('GET', `/runs/${card.runs[0].id}`, undefined, a.link)).body;
    expect(run.actions.filter((x: string, i: number) => run.decisions.some((d: any) => d.step === i && !d.forced))).toEqual(played);
    expect((await t2.send('POST', `/sessions/${anon.session}/move`, { action: anon.legalActions[0].id })).status).toBe(200);
    expect(t2.db.all('SELECT id FROM live').map((r: any) => r.id)).toEqual([anon.session]);
  });

  it('does not charge the restart downtime to the latency clock', async () => {
    const file = tmpDb(), clock = { t: Date.now() };
    const t1 = setup(clock, file), s = (await t1.send('POST', '/sessions', { game: 'dino', mode: 'practice', seed: 2, clock: 'latency' })).body;
    t1.close();
    const t2 = make(clock, file);
    await new Promise((r) => setTimeout(r, 400));
    expect((await t2.send('POST', `/sessions/${s.session}/move`, { action: s.legalActions[0].id })).body.step).toBeLessThan(s.step + 5);
  });

  it('checkpoints sessions every sweep so a crash loses at most a minute', async () => {
    const file = tmpDb(), t = make({ t: Date.now() }, file);
    const s = (await t.send('POST', '/sessions', { game: 'beams', mode: 'practice', seed: 2 })).body;
    t.sweep();
    const raw = new DatabaseSync(file);
    expect(JSON.parse((raw.prepare('SELECT data FROM live WHERE id = ?').get(s.session) as { data: string }).data)).toMatchObject({ game: 'beams', seed: 2, watch: s.watch });
    raw.close();
  });

  it('finds the run of an expired watch id in the database', async () => {
    const file = tmpDb(), clock = { t: Date.now() };
    const t1 = setup(clock, file), p = await t1.play(undefined, 'beams', 'practice', { seed: 5 }), runId = (await t1.send('GET', `/watch/${p.first.body.watch}`)).body.runId;
    t1.close();
    expect((await make(clock, file).send('GET', `/watch/${p.first.body.watch}`)).body).toEqual({ error: 'unknown or expired watch id', runId });
  });
});

describe('scores', () => {
  it('backfills normalized scores lost to a crash or a busy worker', async () => {
    const t = make(), a = await t.register(ai('late')), id = rid();
    t.db.run('INSERT INTO runs (id, entry, game, version, seed, repeat, track, help, cap, bench, score, steps, agree, dec, truncated, created, ep) VALUES (?, ?, ?, ?, 4, 0, ?, 1, 64, 1, 3, 0, 0, 0, 0, ?, ?)', id, a.entryId, 'beams', GAMES.beams.version, 'turn', 'now', new Uint8Array());
    t.sweep();
    const norm = await (async () => { for (;;) { const r = t.db.get<{ norm: number | null }>('SELECT norm FROM runs WHERE id = ?', id)!; if (r.norm !== null) return r.norm; await new Promise((r) => setTimeout(r, 20)); } })();
    expect(typeof norm).toBe('number');
  });

  it('serves a cached leaderboard and refreshes it at most every REFRESH_MS', async () => {
    const t = make(), a = await t.register(ai('board')), t0 = t.clock.t;
    const rows = async () => (await t.send('GET', '/leaderboard?game=beams')).body.rows.map((r: any) => r.entryId);
    expect(await rows()).toEqual(['expert', 'random']);
    await t.play(a.link, 'beams', 'benchmark');
    while (t.db.get<{ n: number }>('SELECT COUNT(*) n FROM runs WHERE norm IS NOT NULL')!.n === 0) await new Promise((r) => setTimeout(r, 20));
    t.clock.t = t0 + REFRESH_MS - 1;
    expect(await rows()).toEqual(['expert', 'random']);
    t.clock.t = t0 + REFRESH_MS;
    expect(await rows()).toEqual(['expert', 'random']);
    await new Promise((r) => setTimeout(r, 300));
    expect(await rows()).toContain(a.entryId);
  });

  it('drops runs of an older game major from standings and the stopping rule, but keeps them viewable', async () => {
    const t = make(), a = await t.register(ai('old-major')), old = `${+GAMES.beams.version.split('.')[0] + 1}.0.0`, ids: string[] = [];
    for (let s = 1; s <= 10; s++) { ids.push(rid()); t.db.run('INSERT INTO runs (id, entry, game, version, seed, repeat, track, help, cap, bench, score, norm, steps, agree, dec, truncated, created, ep) VALUES (?, ?, ?, ?, ?, 0, ?, 1, 64, 1, 0, 0.5, 0, 0, 0, 0, ?, ?)', ids.at(-1)!, a.entryId, 'beams', old, s, 'turn', 'now', deflateSync('{"actions":[],"decisions":[]}')); }
    for (const q of ['?game=beams', '']) expect((await t.send('GET', `/leaderboard${q}`)).body.rows.map((r: any) => r.entryId)).not.toContain(a.entryId);
    expect(parseSeedCode((await t.send('POST', '/sessions', { game: 'beams', mode: 'benchmark' }, a.link)).body.seedCode)!.seed).toBeGreaterThan(10);
    expect((await t.send('GET', `/runs/${ids[0]}`)).body.version).toBe(old);
  });

  it('keys reference scores by game version', () => {
    const file = tmpDb(), old = new DatabaseSync(file);
    for (const [i, m] of MIGRATIONS.slice(0, 3).entries()) old.exec(`${m} PRAGMA user_version = ${i + 1};`);
    old.exec(`INSERT INTO refs VALUES ('beams', 1, 64, 9, 1); INSERT INTO runs (id, entry, game, version, seed, repeat, track, help, cap, bench, score, norm, steps, agree, dec, truncated, created, ep) VALUES ('r1', NULL, 'beams', '1', 1, 0, 'turn', 1, 64, 1, 5, 0.5, 3, 1, 2, 0, 'now', x'00');`);
    old.close();
    const db = openDb(file);
    expect(db.all('SELECT * FROM refs')).toEqual([]);
    expect(db.all<{ name: string }>('PRAGMA table_info(refs)').map((c) => c.name)).toContain('version');
    expect(db.get('SELECT id, norm, watch FROM runs')).toMatchObject({ id: 'r1', norm: 0.5, watch: null });
    db.run('INSERT OR REPLACE INTO refs (game, seed, cap, expert, random) VALUES (?, ?, ?, ?, ?)', 'beams', 1, 64, 9, 1);
    db.close();
    openDb(file).close();
  });
});

describe('registration', () => {
  it('rejects invisible and direction-override characters in names', async () => {
    const t = make();
    for (const model of ['gpt‮', 'a​b', '﻿x']) expect((await t.send('POST', '/register', { ...ai(model) })).status).toBe(400);
    expect((await t.send('POST', '/register', { ...human, skill: 'often' })).status).toBe(200);
  });
});

describe('backup', () => {
  it('writes a dated VACUUM INTO copy under /data/backups and keeps the newest 7', () => {
    const data = mkdtempSync(join(tmpdir(), 'abdata-')), dir = join(data, 'backups');
    const db = openDb(join(data, 'arcadebench.db'));
    db.run("INSERT INTO entries VALUES ('e1', 't', 'ai', 'x', 'a@b.c', NULL, 'listed', 'm', 'tool', 'llm', 1, NULL, 0, 'now')");
    mkdirSync(dir);
    for (let d = 1; d <= 9; d++) writeFileSync(join(dir, `arcadebench-2026010${d}.db`), '');
    writeFileSync(join(data, 'backup-before-cleanup-20261004.db'), 'keep');
    execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./backup.ts', import.meta.url))], { env: { ...process.env, DATA_DIR: data }, stdio: 'pipe' });
    db.close();
    const files = readdirSync(dir).sort(), today = `arcadebench-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.db`;
    expect(files).toHaveLength(7);
    expect(files).toContain(today);
    expect(new DatabaseSync(join(dir, today)).prepare('SELECT id FROM entries').all()).toEqual([{ id: 'e1' }]);
    expect(readdirSync(data)).toContain('backup-before-cleanup-20261004.db');
  });
});

describe('static files', () => {
  it('never serves files outside the web build and sends no referrer', async () => {
    const t = make();
    writeFileSync(join(web, '..', 'ab-secret.txt'), 'top-secret');
    for (const p of ['/arcadebench/..%2fab-secret.txt', '/arcadebench/%2e%2e/ab-secret.txt', '/arcadebench/assets/..%2f..%2fab-secret.txt', '/arcadebench/..%5cab-secret.txt', '/arcadebench//..//ab-secret.txt']) expect((await t.send('GET', p)).text).not.toContain('top-secret');
    expect((await t.send('GET', '/arcadebench/play?as=agent&link=x')).headers.get('referrer-policy')).toBe('no-referrer');
  });
});
