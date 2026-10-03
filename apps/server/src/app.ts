import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { API, BASE_PATH, LIMITS, type DailySeeds, type GameInfo, type LiveFrame, type RegisterRes, type Track } from '@arcadebench/api';
import { draw, GAMES, ORIGINALS, PAPER_CAPS, seedCodeOf, type HelpLevel } from '@arcadebench/engine';
import pkg from '../package.json' with { type: 'json' };
import { makeBoard } from './board.ts';
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

export interface Options { file: string; web: string; origin: string; now?: () => number }

const TRACKS: Track[] = ['turn', 'latency', 'token', 'computer-use', 'human'];
const PUBLIC_GET = new RegExp(`^${API}/(health|games|seeds|leaderboard|runs|entries|live|watch)\\b`);
const MCP = `${BASE_PATH}/mcp/:token`, BEAT_MS = 15_000, STREAMS_PER_IP = 8, STREAMS_MAX = 300, BACKLOG = 4 << 20;
const GAME_INFO: GameInfo[] = Object.values(GAMES).map((g) => ({ id: g.id, prefix: g.prefix, name: g.name, version: g.version, rules: g.rules, realtime: g.realtime, cap: PAPER_CAPS[g.id], original: ORIGINALS.some((o) => o.id === g.id) }));
const cacheControl = (path: string, ok: boolean) =>
  path.startsWith(API) || path.startsWith(`${BASE_PATH}/mcp/`) ? 'no-store' : ok && path.startsWith(`${BASE_PATH}/assets/`) ? 'public, max-age=31536000, immutable' : 'no-cache';
const tooLarge = (c: Context) => c.json({ error: 'request body too large' }, 413);

export function createApp(o: Options) {
  const now = o.now ?? Date.now, db = openDb(o.file), pool = makePool();
  const refs = makeRefs(db, pool), board = makeBoard(db, now);
  const save = makeRuns(db, refs, board.invalidate), sessions = makeSessions({ db, save, refs, origin: o.origin, now }), verify = makeVerify({ db, refs, save, pool });
  const callMcp = mcpHandler(sessions, board);
  const registerLimit = limiter(LIMITS.registerPerIpPerHour, 3600_000, now), tokenLimit = limiter(LIMITS.requestsPerTokenPerMinute, 60_000, now);
  const sweeper = setInterval(() => sessions.sweep(), 60_000).unref();

  const ip = (c: Context) => {
    try {
      const peer = getConnInfo(c).remote.address ?? '', fwd = c.req.header('x-forwarded-for');
      return fwd && /^(127\.|::1$|::ffff:127\.)/.test(peer) ? fwd.split(',').at(-1)!.trim() : peer;
    } catch { return 'local'; }
  };
  const byToken = (t: string) => db.get<Entry>('SELECT * FROM entries WHERE token = ?', sha256(t));
  function who(c: Context, required = false): Entry | null {
    const h = c.req.header('authorization');
    let e: Entry | null = null;
    if (h !== undefined) { const m = /^Bearer (\S+)$/.exec(h); e = (m && byToken(m[1])) || null; if (!e) throw new Fail(401, 'invalid link token'); }
    else if (required) throw new Fail(401, 'link token required');
    if (!tokenLimit(e?.id ?? `ip:${ip(c)}`)) throw new Fail(429, 'too many requests; slow down');
    return e;
  }
  const owner = (c: Context, e: Entry | null) => e?.id ?? `ip:${ip(c)}`;
  const json = async (c: Context) => {
    const b = await c.req.json().catch(() => null);
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : bad('body', 'must be a JSON object');
  };

  const app = new Hono(), perIp = new Map<string, number>();
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
    await next();
  });

  app.get(`${API}/health`, (c) => c.json({ ok: true, version: pkg.version }));
  app.get(`${API}/games`, (c) => { c.header('cache-control', 'public, max-age=3600'); return c.json(GAME_INFO); });
  app.get(`${API}/seeds/daily`, (c) => {
    const day = Math.floor(now() / 864e5);
    const seeds = Object.fromEntries(Object.keys(GAMES).map((g, i) => [g, seedCodeOf(g, draw(day, i, 0))]));
    return c.json({ date: new Date(day * 864e5).toISOString().slice(0, 10), seeds } satisfies DailySeeds);
  });

  app.post(`${API}/register`, async (c) => {
    if (!registerLimit(ip(c))) throw new Fail(429, 'too many registrations from this address; try again later');
    const n = parseRegister(await json(c)), id = rid(), token = rid(32);
    db.run('INSERT INTO entries (id, token, kind, x, email, linkedin, listing, name, mode, agent_type, help, skill, baseline, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, sha256(token), n.kind, n.x, n.email, n.linkedin, n.listing, n.name, n.mode, n.agentType, n.help, n.skill, +n.baseline, new Date(now()).toISOString());
    return c.json({ entryId: id, link: token, mcpUrl: `${o.origin}${BASE_PATH}/mcp/${token}`, apiBase: `${o.origin}${API}`, playUrl: `${o.origin}${BASE_PATH}/play?as=agent&link=${token}` } satisfies RegisterRes);
  });

  app.post(`${API}/sessions`, async (c) => { const e = who(c); return c.json(sessions.start(e, owner(c, e), await json(c)).observation()); });
  app.get(`${API}/sessions/:id`, (c) => c.json(sessions.get(who(c), c.req.param('id')).observation()));
  app.post(`${API}/sessions/:id/move`, async (c) => {
    const e = who(c), b = await json(c), { s, invalid } = sessions.move(e, c.req.param('id'), b.action, b.tokensOut);
    return c.json({ ...s.observation(), ...(invalid ? { invalid } : {}) });
  });
  app.get(`${API}/live`, (c) => c.json(sessions.list()));
  const missing = (c: Context) => c.json({ error: 'unknown or expired watch id', ...sessions.gone(c.req.param('watch')!) }, 404);
  app.get(`${API}/watch/:watch`, (c) => { const w = sessions.watch(c.req.param('watch')); return w ? c.json(w.frame()) : missing(c); });
  app.get(`${API}/watch/:watch/stream`, (c) => {
    const w = sessions.watch(c.req.param('watch'));
    if (!w) return missing(c);
    const addr = ip(c);
    if (streams >= STREAMS_MAX || (perIp.get(addr) ?? 0) >= STREAMS_PER_IP) throw new Fail(429, 'too many open streams; close one first');
    streams++; perIp.set(addr, (perIp.get(addr) ?? 0) + 1);
    const enc = new TextEncoder();
    let beat: ReturnType<typeof setInterval> | undefined, off = () => {}, closed = false, ctl!: ReadableStreamDefaultController<Uint8Array>;
    const close = () => {
      if (closed) return;
      closed = true; clearInterval(beat); off(); streams--;
      if (perIp.get(addr) === 1) perIp.delete(addr); else perIp.set(addr, perIp.get(addr)! - 1);
      try { ctl.close(); } catch { /* already closed */ }
    };
    const write = (text: string) => { try { ctl.enqueue(enc.encode(text)); if ((ctl.desiredSize ?? 0) < -BACKLOG) close(); } catch { close(); } };
    const send = (f: LiveFrame) => { write(`data: ${JSON.stringify(f)}\n\n`); if (f.done) close(); };
    const body = new ReadableStream<Uint8Array>({
      start(x) {
        ctl = x;
        c.req.raw.signal.addEventListener('abort', close);
        send(w.frame());
        if (closed) return;
        off = w.sub(send);
        beat = setInterval(() => write(': hb\n\n'), BEAT_MS).unref();
      },
      cancel: close,
    }, new ByteLengthQueuingStrategy({ highWaterMark: 1 << 16 }));
    return c.body(body, 200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
  });
  app.post(`${API}/practice/verify`, async (c) => { const e = who(c); return c.json(await verify(await json(c), e)); });

  app.get(`${API}/leaderboard`, (c) => {
    const game = c.req.query('game') || 'overall', h = c.req.query('help');
    if (game !== 'overall' && !GAMES[game]) bad('game', 'unknown game');
    return c.json(board.board(game, pick(c.req.query('track') || undefined, TRACKS, 'track', 'turn'), h === undefined || h === 'all' || h === '' ? 'all' : pick<HelpLevel>(+h as HelpLevel, [0, 1, 2], 'help')));
  });
  app.get(`${API}/runs`, (c) => {
    const game = c.req.query('game') ?? '', seed = c.req.query('seed'), limit = c.req.query('limit');
    if (!GAMES[game]) bad('game', 'unknown game');
    if (seed !== undefined && !(/^\d+$/.test(seed) && +seed < 2 ** 32)) bad('seed', 'must be an integer from 0 to 4294967295');
    if (limit !== undefined && !(/^\d+$/.test(limit) && +limit >= 1 && +limit <= 100)) bad('limit', 'must be an integer from 1 to 100');
    return c.json(board.runs(game, seed === undefined ? undefined : +seed, limit === undefined ? 20 : +limit));
  });
  app.get(`${API}/runs/:id`, (c) => c.json(board.run(c.req.param('id'), who(c))));
  app.get(`${API}/entries/:id`, (c) => {
    const v = who(c), e = db.get<Entry>('SELECT * FROM entries WHERE id = ?', c.req.param('id'));
    if (!e || (e.listing === 'unlisted' && e.id !== v?.id)) throw new Fail(404, 'unknown entry');
    return c.json(board.scorecard(e));
  });
  app.all(`${API}/*`, (c) => c.json({ error: 'not found' }, 404));

  app.post(MCP, bodyLimit({ maxSize: LIMITS.bodyBytes, onError: tooLarge }), async (c) => {
    const e = byToken(c.req.param('token'));
    if (!e) throw new Fail(401, 'invalid link token');
    if (!tokenLimit(e.id)) throw new Fail(429, 'too many requests; slow down');
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
    if (e instanceof Fail) return c.json({ error: e.message }, e.status);
    logError(e);
    return c.json({ error: 'internal error' }, 500);
  });

  return {
    app,
    sessions,
    save,
    db,
    close() { clearInterval(sweeper); sessions.sweep(true); pool.close(); db.close(); },
  };
}
