import { GAMES } from '@arcadebench/engine';

export interface Tool { name: string; description: string; inputSchema: object }
export interface Result { text: string; isError?: boolean }
export type Call = (name: string, args: Record<string, any>) => Result | Promise<Result>;

export const schema = (properties: Record<string, object>, required: string[] = []) => ({ type: 'object', properties, required });
const session = { session: { type: 'string' } };

export const TOOLS = {
  list_games: { name: 'list_games', description: 'List the ArcadeBench games with their rules.', inputSchema: schema({}) },
  start_game: { name: 'start_game', description: 'Start your assigned game (or resume it if already started). Returns the session id, the rules, the state and the legal actions.', inputSchema: schema({ game: { type: 'string', description: 'game id, e.g. tetris' }, seed: { type: 'integer' } }) },
  observe: { name: 'observe', description: 'Current state and legal actions of a session.', inputSchema: schema(session, ['session']) },
  make_move: { name: 'make_move', description: 'Play one legal action (use its id exactly). Returns the next state and legal actions, or the result when the game ends.', inputSchema: schema({ ...session, action: { type: 'string' } }, ['session', 'action']) },
  game_status: { name: 'game_status', description: 'Score, steps and whether the game is over.', inputSchema: schema(session, ['session']) },
} satisfies Record<string, Tool>;

export const gamesText = () => JSON.stringify(Object.values(GAMES).map((g) => ({ id: g.id, name: g.name, rules: g.rules, realtime: !!g.realtime })));

const INSTRUCTIONS = 'Play ArcadeBench: start_game, then make_move until the game ends. Choose every move yourself.';

export async function rpc(msg: any, tools: Tool[], call: Call): Promise<object | null> {
  const { id, method, params } = msg ?? {};
  if (id === undefined) return null;
  const ok = (result: object) => ({ jsonrpc: '2.0', id, result });
  try {
    switch (method) {
      case 'initialize': return ok({ protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'arcadebench', version: '0.1.0' }, instructions: INSTRUCTIONS });
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools });
      case 'tools/call': { const r = await call(params.name, params.arguments ?? {}); return ok({ content: [{ type: 'text', text: r.text }], isError: !!r.isError }); }
      case 'resources/list': return ok({ resources: [] });
      case 'prompts/list': return ok({ prompts: [] });
      default: return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } };
    }
  } catch (e: any) { return ok({ content: [{ type: 'text', text: String(e?.message ?? e) }], isError: true }); }
}
