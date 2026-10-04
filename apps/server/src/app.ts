import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { API, BASE_PATH, LIMITS, type DailySeeds, type GameInfo, type LiveFrame, type RegisterRes, type Track } from '@arcadebench/api';
import { draw, GAMES, ORIGINALS, CAPS, seedCodeOf, type HelpLevel } from '@arcadebench/engine';
import { makeBoard } from './board.ts';
import { makeMatches } from './matches.ts';
import { openDb, type Entry } from './db.ts';
import { limiter } from './limit.ts';
import { mcp as mcpHandler } from './mcp.ts';
import { makeRefs } from './refs.ts';
import { makeRuns } from './runs.ts';
import { makeSessions } from './sessions.ts';
import { Fail, logError, rid, sha256 } from './util.ts';
import { bad, parseRegister, pick } from './validate.ts';
import { makeVerify } from './verify.ts';
import { makePool } from './work.ts';

export interface Options { file: string; web: string; origin: string; now?: () => number; pace?: number }

const TRACKS: Track[] = ['turn', 'latency', 'token', 'computer-use', 'human'];
const PUBLIC_GET = new RegExp(`^${API}/(health|games|seeds|leaderboard|runs|entries|live|watch|chess)\\b`);
const MCP = `${BASE_PATH}/mcp/:token`, BEAT_MS = 15_000, STREAMS_PER_IP = 8, STREAMS_MAX = 300, BACKLOG = 1 << 20, IP_PER_MIN = 1200, VERIFY_PER_MIN = 30;
const PRIVATE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i;
const net64 = (a: string) => { const [h, t] = a.split('::'), p = h ? h.split(':') : [], q = t ? t.split(':') : []; return [...p, ...Array(Math.max(0, 8 - p.length - q.length)).fill('0'), ...q].slice(0, 4).join(':') + '::/64'; };
const GAME_INFO: GameInfo[] = Object.values(GAMES).map((g) => ({ id: g.id, prefix: g.prefix, name: g.name, version: g.version, rules: g.rules, ask: g.ask, realtime: g.realtime, cap: CAPS[g.id], original: ORIGINALS.some((o) => o.id === g.id), history: g.history }));
const cacheControl = (path: string, ok: boolean) =>
  path.startsWith(API) || path.startsWith(`${BASE_PATH}/mcp/`) ? 'no-store' : ok && path.startsWith(`${BASE_PATH}/assets/`) ? 'public, max-age=31536000, immutable' : 'no-cache';
const tooLarge = (c: Context) => c.json({ error: 'request body too large' }, 413);

export function createApp(o: Options) {
  const now = o.now ?? Date.now, db = openDb(o.file), pool = makePool();
  const refs = makeRefs(db, pool), board = makeBoard(db, refs, pool, now), runs = makeRuns(db, refs, board.invalidate), save = runs.save;
  const sessions = makeSessions({ db, save, refs, origin: o.origin, now }), verify = makeVerify({ db, refs, save, pool });
  const matches = makeMatches({ db, pool, now, origin: o.origin, pace: o.pace ?? 500, save: runs.saveMatch });
  const callMcp = mcpHandler(sessions, board, matches);
  const registerLimit = limiter(LIMITS.registerPerIpPerHour, 3600_000, now, 'too many registrations from this address; try again later');
  const tokenLimit = limiter(LIMITS.requestsPerTokenPerMinute, 60_000, now, 'too many requests; slow down');
  const ipLimit = limiter(IP_PER_MIN, 60_000, now, 'too many requests from this address; slow down');
  const verifyLimit = limiter(VERIFY_PER_MIN, 60_000, now, 'too many verifications from this address; slow down');
  const tick = () => { sessions.sweep(); matches.sweep(); runs.backfill(); };
  runs.backfill();
  const sweeper = setInterval(tick, 60_000).unref();

  const ip = (c: Context) => {
    let peer: string;
    try { peer = (getConnInfo(c).remote.address ?? '').replace(/^::ffff:/, ''); } catch { return 'local'; }
    const fwd = c.req.header('x-forwarded-for'), a = fwd && PRIVATE.test(peer) ? fwd.split(',').at(-1)!.trim().replace(/^::ffff:/, '') : peer;
    return a.includes(':') ? net64(a) : a;
  };
  const byToken = (t: string) => db.get<Entry>('SELECT * FROM entries WHERE token = ?', sha256(t));
  function who(c: Context): Entry | null {
    const h = c.req.header('authorization');
    let e: Entry | null = null;
    if (h !== undefined) { const m = /^Bearer (\S+)$/.exec(h); e = (m && byToken(m[1])) || null; if (!e) throw new Fail(401, 'invalid link token'); }
    tokenLimit(e?.id ?? `ip:${ip(c)}`);
    return e;
  }
  const owner = (c: Context, e: Entry | null) => e?.id ?? `ip:${ip(c)}`;
  const json = async (c: Context) => {
    const b = await c.req.json().catch(() => null);
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : bad('body', 'must be a JSON object');
  };

  const app = new Hono(), perIp = new Map<string, number>(), enc = new TextEncoder(), sse = new WeakMap<LiveFrame, Uint8Array>();
  const bytes = (f: LiveFrame) => sse.get(f) ?? sse.set(f, enc.encode(`data: ${JSON.stringify(f)}\n\n`)).get(f)!;
  let streams = 0;
  app.use(`${BASE_PATH}/leaderboard`, async (c, next) => {
    await next();
    if (c.req.query('embed') !== '1') return;
    c.header('content-security-policy', (c.res.headers.get('content-security-policy') ?? '').replace("frame-ancestors 'none'", 'frame-ancestors *'));
    c.res.headers.delete('x-frame-options');
  });
  app.use(secureHeaders({ xFrameOptions: 'DENY', contentSecurityPolicy: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], fontSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'blob:'], mediaSrc: ["'self'", 'blob:'], connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'none'"], formAction: ["'self'"], frameAncestors: ["'none'"],
  } }));
  app.use(`${BASE_PATH}/*`, async (c, next) => {
    await next();
    if (!c.res.headers.has('cache-control')) c.header('cache-control', cacheControl(c.req.path, c.res.ok));
  });
  app.use(`${API}/*`, bodyLimit({ maxSize: LIMITS.bodyBytes, onError: tooLarge }), async (c, next) => {
    if (c.req.method === 'GET' && PUBLIC_GET.test(c.req.path)) c.header('access-control-allow-origin', '*');
    ipLimit(ip(c));
    await next();
  });

  app.get(`${API}/health`, (c) => c.json({ ok: true, version: process.env.VERSION ?? 'dev', open: sessions.open, matches: matches.open, waiting: matches.waiting, queue: pool.size, rssMb: Math.round(process.memoryUsage.rss() / 2 ** 20) }));
  app.get(`${API}/games`, (c) => { c.header('cache-control', 'public, max-age=3600'); return c.json(GAME_INFO); });
  app.get(`${API}/seeds/daily`, (c) => {
    const day = Math.floor(now() / 864e5);
    const seeds = Object.fromEntries(Object.keys(GAMES).map((g, i) => [g, seedCodeOf(g, draw(day, i, 0))]));
    return c.json({ date: new Date(day * 864e5).toISOString().slice(0, 10), seeds } satisfies DailySeeds);
  });

  app.post(`${API}/register`, async (c) => {
    registerLimit(ip(c));
    const n = parseRegister(await json(c)), id = rid(), token = rid(32);
    db.run('INSERT INTO entries (id, token, kind, x, email, linkedin, listing, name, mode, agent_type, help, skill, baseline, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, sha256(token), n.kind, n.x, n.email, n.linkedin, n.listing, n.name, n.mode, n.agentType, n.help, n.skill, +n.baseline, new Date(now()).toISOString());
    return c.json({ entryId: id, link: token, mcpUrl: `${o.origin}${BASE_PATH}/mcp/${token}`, apiBase: `${o.origin}${API}`, playUrl: `${o.origin}${BASE_PATH}/play?as=agent&link=${token}` } satisfies RegisterRes);
  });

  app.post(`${API}/sessions`, async (c) => { const e = who(c); return c.json(sessions.start(e, owner(c, e), await json(c)).observation()); });
  app.get(`${API}/sessions/:id`, (c) => c.json(sessions.get(who(c), c.req.param('id')).observation()));
  app.post(`${API}/sessions/:id/move`, async (c) => {
    const e = who(c), b = await json(c), { s, invalid } = sessions.move(e, c.req.param('id'), b.action, b.tokensOut, b.step);
    return c.json({ ...s.observation(), ...(invalid ? { invalid } : {}) });
  });
  app.get(`${API}/live`, (c) => c.json([...matches.list(), ...sessions.list()].slice(0, 50)));
  const missing = (c: Context) => c.json({ error: 'unknown or expired watch id', ...sessions.gone(c.req.param('watch')!) }, 404);
  const watching = (id: string) => sessions.watch(id) ?? matches.watch(id);
  app.get(`${API}/watch/:watch`, (c) => { const w = watching(c.req.param('watch')); return w ? c.json({ ...w.frame(), actions: w.actions() }) : missing(c); });
  app.get(`${API}/watch/:watch/stream`, (c) => {
    const w = watching(c.req.param('watch'));
    if (!w) return missing(c);
    const addr = ip(c);
    if ((perIp.get(addr) ?? 0) >= STREAMS_PER_IP) throw new Fail(429, 'too many open streams; close one first', 30);
    if (streams >= STREAMS_MAX) throw new Fail(503, 'too many viewers right now; try again shortly', 30);
    streams++; perIp.set(addr, (perIp.get(addr) ?? 0) + 1);
    let beat: ReturnType<typeof setInterval> | undefined, off = () => {}, closed = false, ctl!: ReadableStreamDefaultController<Uint8Array>;
    const close = () => {
      if (closed) return;
      closed = true; clearInterval(beat); off(); streams--;
      if (perIp.get(addr) === 1) perIp.delete(addr); else perIp.set(addr, perIp.get(addr)! - 1);
      try { ctl.close(); } catch { /* already closed */ }
    };
    const write = (b: Uint8Array) => { try { ctl.enqueue(b); if ((ctl.desiredSize ?? 0) < -BACKLOG) close(); } catch { close(); } };
    const send = (f: LiveFrame) => { write(bytes(f)); if (f.done) close(); };
    const hb = enc.encode(': hb\n\n');
    const body = new ReadableStream<Uint8Array>({
      start(x) {
        ctl = x;
        c.req.raw.signal.addEventListener('abort', close);
        send(w.frame());
        if (closed) return;
        off = w.sub(send);
        beat = setInterval(() => write(hb), BEAT_MS).unref();
      },
      cancel: close,
    }, new ByteLengthQueuingStrategy({ highWaterMark: 1 << 16 }));
    return c.body(body, 200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
  });
  const seat = (c: Context, b: Record<string, unknown> = {}) => (b.seat === undefined ? { ...b, seat: c.req.header('x-seat') } : b);
  app.post(`${API}/matches`, async (c) => { const e = who(c); return c.json(matches.create(e, owner(c, e), await json(c))); });
  app.get(`${API}/matches/:id`, async (c) => {
    const e = who(c), id = c.req.param('id'), w = c.req.query('wait'), at = c.req.header('x-seat');
    if (w !== undefined && !(/^\d+$/.test(w) && +w <= 25)) bad('wait', 'must be 0 to 25 seconds');
    let v = matches.get(id, e, at);
    if (w !== undefined && v.status !== 'done' && !(v.status === 'live' && v.you === v.turn)) { await matches.wait(id, +w * 1000); v = matches.get(id, e, at); }
    return c.json(v);
  });
  app.post(`${API}/matches/:id/join`, async (c) => { const e = who(c); return c.json(matches.join(e, c.req.param('id'), seat(c, await json(c)))); });
  app.post(`${API}/matches/:id/move`, async (c) => { const e = who(c); return c.json(matches.move(e, c.req.param('id'), seat(c, await json(c)))); });
  app.post(`${API}/matches/:id/resign`, async (c) => { const e = who(c); return c.json(matches.resign(e, c.req.param('id'), seat(c, await json(c)))); });
  app.post(`${API}/matches/:id/draw`, async (c) => { const e = who(c); return c.json(matches.offer(e, c.req.param('id'), seat(c, await json(c)))); });
  app.post(`${API}/queue`, async (c) => { const e = who(c); return c.json(matches.enter(e, owner(c, e), await json(c))); });
  app.get(`${API}/queue`, (c) => { const e = who(c), t = c.req.header('x-ticket'); return c.json(t === undefined && !e ? { waiting: matches.waiting } : matches.status(t, e)); });
  app.delete(`${API}/queue`, (c) => { matches.leave(c.req.header('x-ticket'), who(c)); return c.json({ ok: true }); });
  app.get(`${API}/chess/ratings`, (c) => c.json(matches.ratings(who(c)?.id)));
  app.post(`${API}/practice/verify`, async (c) => { const e = who(c); verifyLimit(ip(c)); return c.json(await verify(await json(c), e)); });

  app.get(`${API}/leaderboard`, async (c) => {
    const game = c.req.query('game') || 'overall', h = c.req.query('help');
    if (game !== 'overall' && !GAMES[game]) bad('game', 'unknown game');
    return c.json(await board.board(game, pick(c.req.query('track') || undefined, TRACKS, 'track', 'turn'), h === undefined || h === 'all' || h === '' ? 'all' : pick<HelpLevel>(+h as HelpLevel, [0, 1, 2], 'help')));
  });
  app.get(`${API}/runs`, (c) => {
    const game = c.req.query('game') ?? '', seed = c.req.query('seed'), limit = c.req.query('limit');
    if (!GAMES[game]) bad('game', 'unknown game');
    if (seed !== undefined && !(/^\d+$/.test(seed) && +seed < 2 ** 32)) bad('seed', 'must be an integer from 0 to 4294967295');
    if (limit !== undefined && !(/^\d+$/.test(limit) && +limit >= 1 && +limit <= 100)) bad('limit', 'must be an integer from 1 to 100');
    return c.json(board.runs(game, seed === undefined ? undefined : +seed, limit === undefined ? 20 : +limit));
  });
  app.get(`${API}/runs/:id`, (c) => c.json(board.run(c.req.param('id'), who(c))));
  app.get(`${API}/entries/:id`, async (c) => {
    const v = who(c), e = db.get<Entry>('SELECT * FROM entries WHERE id = ?', c.req.param('id'));
    if (!e || (e.listing === 'unlisted' && e.id !== v?.id)) throw new Fail(404, 'unknown entry');
    return c.json(await board.scorecard(e));
  });
  app.all(`${API}/*`, (c) => c.json({ error: 'not found' }, 404));

  app.post(MCP, bodyLimit({ maxSize: LIMITS.bodyBytes, onError: tooLarge }), async (c) => {
    ipLimit(ip(c));
    const e = byToken(c.req.param('token'));
    if (!e) throw new Fail(401, 'invalid link token');
    tokenLimit(e.id);
    const msg = await c.req.json().catch(() => undefined);
    if (msg === undefined) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, 400);
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'send one JSON-RPC request per POST' } }, 400);
    const reply = await callMcp(e, msg);
    return reply ? c.json(reply) : c.body(null, 202);
  });
  app.all(MCP, (c) => c.body(null, 405, { allow: 'POST' }));

  const files = serveStatic({ root: o.web, rewriteRequestPath: (p) => p.slice(BASE_PATH.length) }), spa = serveStatic({ root: o.web, path: 'index.html' });
  app.get(BASE_PATH, files, spa);
  app.get(`${BASE_PATH}/*`, files, spa);

  app.notFound((c) => c.json({ error: 'not found' }, 404));
  app.onError((e, c) => {
    if (e instanceof Fail) return c.json({ error: e.message }, e.status, e.retry ? { 'retry-after': String(e.retry) } : {});
    logError(e, { method: c.req.method, route: c.req.routePath });
    return c.json({ error: 'internal error' }, 500);
  });

  return {
    app,
    sessions,
    matches,
    save,
    db,
    pool,
    tick,
    close() { clearInterval(sweeper); sessions.persist(true); pool.close(); db.close(); },
  };
}
