import type { MatchRes, MatchView } from '@arcadebench/api';
import { gamesText, rpc, schema, TOOLS, type Tool } from '@arcadebench/mcp';
import type { Board } from './board.ts';
import type { Entry } from './db.ts';
import type { Matches } from './matches.ts';
import type { Sessions } from './sessions.ts';
import { Fail, logError } from './util.ts';

const INSTRUCTIONS = 'Play ArcadeBench: start_game, then make_move until the game ends, choosing every move yourself. In benchmark mode keep starting games of the same game until start_game says the benchmark is complete. Share each watchUrl with the user. For chess against other players, use chess_join, chess_state and chess_move.';
const INVITE = /\/chess\/([A-Za-z0-9_-]+)#([A-Za-z0-9_-]+)/;
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
  {
    name: 'chess_join',
    description: 'Take a seat in a chess match. Give exactly one of: invite (an invite link someone sent you), opponent ("computer:1" to "computer:5", "human" or "agent": creates a match and returns the invite link for the other seat), or queue true (wait in the open queue for any opponent; optionally computer_level 1 to 5 and after_seconds to fall back to the computer). color is white, black or any. Returns the match: share watchUrl with the user. Rated matches update your chess Elo.',
    inputSchema: schema({ invite: { type: 'string' }, opponent: { type: 'string' }, queue: { type: 'boolean' }, color: { type: 'string', enum: ['white', 'black', 'any'] }, computer_level: { type: 'integer' }, after_seconds: { type: 'integer' } }),
  },
  { name: 'chess_state', description: 'The match from your seat: FEN, an ASCII board, the move list in SAN and, on your turn, the legal moves in UCI and SAN. With wait (seconds, up to 25) it waits for the opponent to move or for the match to change first. While waiting in the queue, call chess_join with queue true again.', inputSchema: schema({ match: { type: 'string' }, wait: { type: 'integer' } }, ['match']) },
  { name: 'chess_move', description: 'Play a legal move in UCI notation (e2e4, e1g1 to castle, e7e8q to promote). Every move is scored against the engine. Then call chess_state with wait to get the reply.', inputSchema: schema({ match: { type: 'string' }, move: { type: 'string' } }, ['match', 'move']) },
  { name: 'chess_resign', description: 'Resign a chess match, or with draw "offer", "accept" or "decline" answer a draw.', inputSchema: schema({ match: { type: 'string' }, draw: { type: 'string', enum: ['offer', 'accept', 'decline'] } }, ['match']) },
  { name: 'get_scorecard', description: 'Your scorecard: leaderboard rows per track and your runs so far (rows refresh within about 15 seconds).', inputSchema: schema({}) },
];

const brief = (v: MatchView | MatchRes) => {
  const { match: m, seats } = 'match' in v ? v : { match: v, seats: [] };
  const mine = m.status === 'live' && m.you === m.turn;
  return JSON.stringify({ ...m, grades: undefined, moves: undefined, ...(seats.some((x) => x.invite) && { invites: seats.filter((x) => x.invite) }), next: m.status === 'done' ? 'the match is over' : m.status === 'open' ? 'waiting for the other seat to join the invite' : mine ? 'your move: call chess_move with one legal id' : 'waiting for the opponent: call chess_state with wait 20' });
};

export const mcp = (sessions: Sessions, board: Board, matches: Matches) => (entry: Entry, msg: unknown) => rpc(msg, MCP_TOOLS, async (name, a) => {
  try {
    const s = () => sessions.get(entry, String(a.session));
    const waited = async (id: string, sec: number) => {
      let v = matches.get(id, entry, undefined);
      if (sec && v.status !== 'done' && !(v.status === 'live' && v.you === v.turn)) { await matches.wait(id, sec * 1000); v = matches.get(id, entry, undefined); }
      return v;
    };
    switch (name) {
      case 'list_games': return { text: gamesText() };
      case 'start_game': return { text: JSON.stringify({ ...sessions.start(entry, entry.id, { game: a.game, mode: a.mode, seed: a.seed }).view(), share: 'Tell the user to open watchUrl to watch this game live.' }) };
      case 'observe': return { text: JSON.stringify(s().view()) };
      case 'make_move': { const r = sessions.move(entry, String(a.session), a.action, undefined, a.step); return r.invalid ? { text: r.invalid, isError: true } : { text: JSON.stringify(r.s.view()) }; }
      case 'game_status': return { text: JSON.stringify(s().status()) };
      case 'chess_join': {
        const found = typeof a.invite === 'string' ? INVITE.exec(a.invite) : null;
        if (a.invite !== undefined) { if (!found) return { text: 'invite must be a link like https://…/chess/<match>#<token>', isError: true }; return { text: brief(matches.join(entry, found[1], { seat: found[2] })) }; }
        if (a.queue) {
          const q = matches.enter(entry, entry.id, { color: a.color ?? 'any', ...(a.computer_level && { computer: { level: a.computer_level, after: a.after_seconds ?? 30 } }) });
          return { text: q.match ? brief(q.match) : JSON.stringify({ status: 'waiting', expires: q.expires, fallback: q.fallback, next: 'call chess_join with queue true again to check' }) };
        }
        const opp = String(a.opponent ?? ''), color = a.color === 'black' ? 'black' : 'white', other = color === 'white' ? { white: 'agent', black: opp } : { white: opp, black: 'agent' };
        return { text: brief(matches.create(entry, entry.id, { ...other, me: color })) };
      }
      case 'chess_state': return { text: brief(await waited(String(a.match), Math.min(25, Math.max(0, Math.floor(+a.wait || 0))))) };
      case 'chess_move': return { text: brief(matches.move(entry, String(a.match), { move: a.move })) };
      case 'chess_resign': return { text: brief(a.draw ? matches.offer(entry, String(a.match), { action: a.draw }) : matches.resign(entry, String(a.match), {})) };
      case 'get_scorecard': return { text: JSON.stringify(await board.scorecard(entry)) };
      default: return { text: `unknown tool ${name}`, isError: true };
    }
  } catch (e) {
    if (e instanceof Fail) return { text: e.message, isError: true };
    logError(e, { tool: name });
    return { text: 'internal error', isError: true };
  }
}, INSTRUCTIONS);
