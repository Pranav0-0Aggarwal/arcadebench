import { gamesText, rpc, schema, TOOLS, type Tool } from '@arcadebench/mcp';
import type { Board } from './board.ts';
import type { Entry } from './db.ts';
import type { Sessions } from './sessions.ts';
import { Fail, logError } from './util.ts';

const INSTRUCTIONS = 'Play ArcadeBench: start_game, then make_move until the game ends, choosing every move yourself. In benchmark mode keep starting games of the same game until start_game says the benchmark is complete. Share each watchUrl with the user.';
const MCP_TOOLS: Tool[] = [
  TOOLS.list_games,
  {
    name: 'start_game',
    description: 'Start a game. Benchmark mode draws a fresh random seed (shown openly in seedCode) for every game and every benchmark game counts on your scorecard, finished or abandoned; keep starting benchmark games until this tool answers "benchmark complete for <game>" (10 to 30 fresh seeds, then 3 repeats of your first seeds). Practice takes an optional seed and does not count. Returns the session id, rules, state, legal actions and watchUrl: share watchUrl with the user so they can watch live. At most 8 games can be open at once; "too many" errors mean wait and retry.',
    inputSchema: schema({ game: { type: 'string', description: 'game id, e.g. tetris' }, mode: { type: 'string', enum: ['practice', 'benchmark'] }, seed: { type: 'integer', description: 'practice only' } }, ['game', 'mode']),
  },
  TOOLS.observe,
  { ...TOOLS.make_move, inputSchema: schema({ session: { type: 'string' }, action: { type: 'string' }, step: { type: 'integer', description: 'optional: the step of the state you are answering; a retried move with an old step is not played twice' } }, ['session', 'action']) },
  TOOLS.game_status,
  { name: 'get_scorecard', description: 'Your scorecard: leaderboard rows per track and your runs so far (rows refresh within about 15 seconds).', inputSchema: schema({}) },
];

export const mcp = (sessions: Sessions, board: Board) => (entry: Entry, msg: unknown) => rpc(msg, MCP_TOOLS, async (name, a) => {
  try {
    const s = () => sessions.get(entry, String(a.session));
    switch (name) {
      case 'list_games': return { text: gamesText() };
      case 'start_game': return { text: JSON.stringify({ ...sessions.start(entry, entry.id, { game: a.game, mode: a.mode, seed: a.seed }).view(), share: 'Tell the user to open watchUrl to watch this game live.' }) };
      case 'observe': return { text: JSON.stringify(s().view()) };
      case 'make_move': { const r = sessions.move(entry, String(a.session), a.action, undefined, a.step); return r.invalid ? { text: r.invalid, isError: true } : { text: JSON.stringify(r.s.view()) }; }
      case 'game_status': return { text: JSON.stringify(s().status()) };
      case 'get_scorecard': return { text: JSON.stringify(await board.scorecard(entry)) };
      default: return { text: `unknown tool ${name}`, isError: true };
    }
  } catch (e) {
    if (e instanceof Fail) return { text: e.message, isError: true };
    logError(e, { tool: name });
    return { text: 'internal error', isError: true };
  }
}, INSTRUCTIONS);
