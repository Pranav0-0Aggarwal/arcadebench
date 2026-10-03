#!/usr/bin/env -S npx tsx
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { GAMES, type HelpLevel } from '@arcadebench/engine';
import { gamesText, rpc, TOOLS, type Result } from './rpc.ts';
import { paperCap, Session } from './session.ts';

const args = process.argv.slice(2), opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const LOCK = { game: opt('game'), seed: opt('seed') === undefined ? undefined : +opt('seed')! };
const OUT = opt('out'), HELP = +(opt('help', '1')!) as HelpLevel, REPEAT = +(opt('repeat', '0')!);
const META = { agent: opt('agent', 'unknown')!, harness: opt('harness', 'mcp')!, settings: { repeat: REPEAT, transport: 'mcp-stdio' } as Record<string, unknown> };
const sessions = new Map<string, Session>();

function save(s: Session, truncated: boolean) {
  if (s.written || !OUT) return;
  s.written = true; mkdirSync(dirname(OUT), { recursive: true });
  appendFileSync(OUT, JSON.stringify(s.episode(truncated)) + '\n');
}
function finishAll() { for (const s of sessions.values()) save(s, true); }

function start(game: string, seed: number): Session {
  const id = `${game}-${seed}`;
  let s = sessions.get(id);
  if (!s) { s = new Session(id, game, seed, { help: HELP, cap: paperCap(game), repeat: REPEAT }, META); sessions.set(id, s); }
  return s;
}

function call(name: string, a: Record<string, any>): Result {
  const get = () => { const s = sessions.get(String(a.session)); if (!s) throw new Error(`unknown session "${a.session}"; call start_game first`); return s; };
  switch (name) {
    case 'list_games': return { text: gamesText() };
    case 'start_game': {
      const game = LOCK.game ?? String(a.game), seed = LOCK.seed ?? Number(a.seed ?? 0);
      if (!GAMES[game]) throw new Error(`unknown game "${a.game}"`);
      const view = JSON.stringify(start(game, seed).view());
      return { text: LOCK.game && a.game && a.game !== LOCK.game ? `This run is assigned to ${LOCK.game}. Starting that game instead.\n${view}` : view };
    }
    case 'observe': return { text: JSON.stringify(get().view()) };
    case 'make_move': {
      const s = get(), error = s.move(String(a.action ?? ''));
      if (s.done) save(s, false);
      return error ? { text: error, isError: true } : { text: JSON.stringify(s.view()) };
    }
    case 'game_status': return { text: JSON.stringify(get().status()) };
    default: throw new Error(`unknown tool ${name}`);
  }
}

const send = (m: unknown) => process.stdout.write(JSON.stringify(m) + '\n');
const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  let msg: unknown;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
  const reply = await rpc(msg, Object.values(TOOLS), call);
  if (reply) send(reply);
});
rl.on('close', () => { finishAll(); process.exit(0); });
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(sig, () => { finishAll(); process.exit(0); });
