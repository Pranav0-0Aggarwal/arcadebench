#!/usr/bin/env -S npx tsx
/** ArcadeBench MCP server over stdio (newline-delimited JSON-RPC 2.0, tools only, no dependencies).
 *  Locked mode for harness runs:  --game <id> --seed <n> --out <file.jsonl> --agent <name> --harness <name> [--help 1] [--repeat 0]  */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { GAMES, type HelpLevel } from '@arcadebench/engine';
import { paperCap, Session } from './session.ts';

const args = process.argv.slice(2), opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const LOCK = { game: opt('game'), seed: opt('seed') === undefined ? undefined : +opt('seed')! };
const OUT = opt('out'), HELP = +(opt('help', '1')!) as HelpLevel;
const META = { agent: opt('agent', 'unknown')!, harness: opt('harness', 'mcp')!, settings: { repeat: +(opt('repeat', '0')!), transport: 'mcp-stdio' } as Record<string, unknown> };
const sessions = new Map<string, Session>();

function save(s: Session, truncated: boolean) {
  if (s.written || !OUT) return;
  s.written = true; mkdirSync(dirname(OUT), { recursive: true });
  appendFileSync(OUT, JSON.stringify(s.episode(truncated)) + '\n');
}
function finishAll() { for (const s of sessions.values()) save(s, true); }

const TOOLS = [
  { name: 'list_games', description: 'List the ArcadeBench games with their rules.', inputSchema: { type: 'object', properties: {} } },
  { name: 'start_game', description: 'Start your assigned game (or resume it if already started). Returns the session id, the rules, the state and the legal actions.', inputSchema: { type: 'object', properties: { game: { type: 'string', description: 'game id, e.g. tetris' }, seed: { type: 'integer' } }, required: [] } },
  { name: 'observe', description: 'Current state and legal actions of a session.', inputSchema: { type: 'object', properties: { session: { type: 'string' } }, required: ['session'] } },
  { name: 'make_move', description: 'Play one legal action (use its id exactly). Returns the next state and legal actions, or the result when the game ends.', inputSchema: { type: 'object', properties: { session: { type: 'string' }, action: { type: 'string' } }, required: ['session', 'action'] } },
  { name: 'game_status', description: 'Score, steps and whether the game is over.', inputSchema: { type: 'object', properties: { session: { type: 'string' } }, required: ['session'] } },
];

function call(name: string, a: Record<string, any>): { text: string; isError?: boolean } {
  const get = () => { const s = sessions.get(String(a.session)); if (!s) throw new Error(`unknown session "${a.session}"; call start_game first`); return s; };
  switch (name) {
    case 'list_games': return { text: JSON.stringify(Object.values(GAMES).map((g) => ({ id: g.id, name: g.name, rules: g.rules, realtime: !!g.realtime }))) };
    case 'start_game': {
      const game = LOCK.game ?? String(a.game), seed = LOCK.seed ?? Number(a.seed ?? 0);
      if (!GAMES[game]) throw new Error(`unknown game "${a.game}"`);
      if (LOCK.game && a.game && a.game !== LOCK.game) return { text: `This run is assigned to ${LOCK.game}. Starting that game instead.\n` + JSON.stringify(start(game, seed).view()) };
      return { text: JSON.stringify(start(game, seed).view()) };
    }
    case 'observe': return { text: JSON.stringify(get().view()) };
    case 'make_move': {
      const s = get(), r = s.move(String(a.action ?? ''));
      if (s.done) save(s, false);
      return r.ok ? { text: JSON.stringify(r.result) } : { text: r.error!, isError: true };
    }
    case 'game_status': { const s = get(); return { text: JSON.stringify({ session: s.id, score: s.g.score(s.s), steps: s.steps, done: s.done, invalidMoves: s.invalid }) }; }
    default: throw new Error(`unknown tool ${name}`);
  }
}
/** one session per (game, seed): calling start_game again resumes it, so a run cannot be restarted for a better score */
function start(game: string, seed: number): Session {
  const id = `${game}-${seed}`;
  let s = sessions.get(id);
  if (!s) { s = new Session(id, game, seed, HELP, paperCap(game), META); sessions.set(id, s); }
  return s;
}

const send = (m: unknown) => process.stdout.write(JSON.stringify(m) + '\n');
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg: any;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
  const { id, method, params } = msg;
  if (id === undefined) return; // notifications (initialized, cancelled) need no reply
  try {
    if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'arcadebench', version: '0.1.0' }, instructions: 'Play your assigned ArcadeBench game: start_game, then make_move until it ends. Choose every move yourself.' } });
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    if (method === 'tools/call') { const r = call(params.name, params.arguments ?? {}); return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: r.text }], isError: !!r.isError } }); }
    if (method === 'resources/list' || method === 'prompts/list') return send({ jsonrpc: '2.0', id, result: method === 'resources/list' ? { resources: [] } : { prompts: [] } });
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  } catch (e: any) { send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(e?.message ?? e) }], isError: true } }); }
});
rl.on('close', () => { finishAll(); process.exit(0); });
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(sig, () => { finishAll(); process.exit(0); });
