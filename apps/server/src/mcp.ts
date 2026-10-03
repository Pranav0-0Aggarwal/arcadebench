import { gamesText, rpc, schema, TOOLS, type Tool } from '@arcadebench/mcp';
import type { Board } from './board.ts';
import type { Entry } from './db.ts';
import type { Sessions } from './sessions.ts';

const MCP_TOOLS: Tool[] = [
  TOOLS.list_games,
  { name: 'start_game', description: 'Start a game. Ranked games use hidden season seeds in a fixed order; practice takes an optional seed. Returns the session id, rules, state and legal actions.', inputSchema: schema({ game: { type: 'string', description: 'game id, e.g. tetris' }, mode: { type: 'string', enum: ['practice', 'ranked'] }, seed: { type: 'integer' } }, ['game', 'mode']) },
  TOOLS.observe, TOOLS.make_move, TOOLS.game_status,
  { name: 'get_scorecard', description: 'Your scorecard: rows per track and your runs so far.', inputSchema: schema({}) },
];

export const mcp = (sessions: Sessions, board: Board) => (entry: Entry, msg: unknown) => rpc(msg, MCP_TOOLS, (name, a) => {
  const s = () => sessions.get(entry, String(a.session));
  switch (name) {
    case 'list_games': return { text: gamesText() };
    case 'start_game': return { text: JSON.stringify(sessions.start(entry, entry.id, { game: a.game, mode: a.mode, seed: a.seed }).view()) };
    case 'observe': return { text: JSON.stringify(s().view()) };
    case 'make_move': { const r = sessions.move(entry, String(a.session), a.action, undefined); return r.invalid ? { text: r.invalid, isError: true } : { text: JSON.stringify(r.s.view()) }; }
    case 'game_status': return { text: JSON.stringify(s().status()) };
    case 'get_scorecard': return { text: JSON.stringify(board.scorecard(entry)) };
    default: throw new Error(`unknown tool ${name}`);
  }
});
