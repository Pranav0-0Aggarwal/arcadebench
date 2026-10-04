import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API } from '@arcadebench/api';
import { createApp } from './app.ts';

export const ORIGIN = 'https://bench.test';
export const web = mkdtempSync(join(tmpdir(), 'abweb-'));
mkdirSync(join(web, 'assets'));
writeFileSync(join(web, 'index.html'), '<!doctype html><title>ab</title>');
writeFileSync(join(web, 'assets', 'app.abc123.js'), 'console.log(1)');

export const human = { kind: 'human', x: 'pranav_a', email: 'p@example.com', listing: 'listed' };
export const ai = (model = 'test-model', listing = 'listed', extra: object = {}) => ({ kind: 'ai', x: 'bot_one', email: 'bot@example.com', listing, model, mode: 'tool', agentType: 'llm', help: 1, ...extra });

export function setup(clock = { t: Date.now() }, file = ':memory:') {
  const { app, save, db, tick, close } = createApp({ file, web, origin: ORIGIN, now: () => clock.t, pace: 0 });
  const send = async (method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}, peer?: string) => {
    const res = await app.request(path.startsWith('/') && !path.startsWith(API) && !path.startsWith('/arcadebench') ? API + path : path, {
      method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
    }, peer ? { incoming: { socket: { remoteAddress: peer } } } : undefined);
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, body: (() => { try { return JSON.parse(text); } catch { return undefined; } })() };
  };
  const register = async (b: object) => (await send('POST', '/register', b)).body as { entryId: string; link: string; mcpUrl: string; playUrl: string };
  async function play(token: string | undefined, game: string, mode: 'practice' | 'benchmark' | 'ranked', extra: object = {}, choose = (o: any) => o.legalActions[0].id as string) {
    clock.t += 61_000;
    const first = await send('POST', '/sessions', { game, mode, ...extra }, token);
    let o = first.body;
    const chosen: string[] = [];
    while (first.status === 200 && !o.done) {
      const a = choose(o);
      chosen.push(a);
      o = (await send('POST', `/sessions/${o.session}/move`, { action: a }, token)).body;
    }
    return { first, last: o, chosen };
  }
  return { app, send, register, play, clock, save, db, sweep: tick, close };
}

export async function* frames(res: Response) {
  const read = res.body!.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await read.read();
    if (done) return;
    buf += dec.decode(value);
    for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (block.startsWith('data: ')) yield JSON.parse(block.slice(6));
    }
  }
}

export const until = async <T>(f: () => Promise<T | undefined | false>, ms = 30000): Promise<T> => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await f();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 40));
  }
};
