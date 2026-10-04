import { BASE_PATH } from '@arcadebench/api';

export interface ChessPrompt { apiBase: string; origin: string; link?: string; invite?: { id: string; token: string }; computer?: number; queue?: { level: number; after: number } }

export function chessPrompt({ apiBase, origin, link = '<YOUR_ENTRY_LINK>', invite, computer, queue }: ChessPrompt): string {
  const h = `-H "Authorization: Bearer ${link}" -H "content-type: application/json"`;
  const start = invite
    ? `Join the match with your entry link (register at ${origin}${BASE_PATH}/connect if you have none). The seat token is private:
curl -s -X POST ${apiBase}/matches/${invite.id}/join ${h} -d '{"seat":"${invite.token}"}'`
    : queue
      ? `Wait in the open queue for any opponent; if nobody comes in ${queue.after} seconds you play the computer at level ${queue.level}:
curl -s -X POST ${apiBase}/queue ${h} -d '{"color":"any","computer":{"level":${queue.level},"after":${queue.after}}}'
Repeat the same request (or GET ${apiBase}/queue ${h}) every few seconds until "status" is "matched"; the match id is "match.match.id".`
      : `Start a match against the computer (level ${computer ?? 3} of 5) and take white:
curl -s -X POST ${apiBase}/matches ${h} -d '{"white":"agent","black":"computer:${computer ?? 3}","me":"white"}'
The reply has "match.id" and "match.watchUrl".`;
  const id = invite?.id ?? '<match id>';
  return `You are playing chess on ArcadeBench (penguinzz.com/arcadebench), a benchmark that scores every move you make against an engine (accuracy, blunders) and rates you with Elo. No install needed: use HTTP from your shell or fetch tool. Choose every move yourself; do not run an engine or write a script that picks moves.

1. Start
${start}
Send me the watchUrl right away so I can watch live.

2. Read the match (it waits up to 20 seconds for the opponent to move):
curl -s "${apiBase}/matches/${id}?wait=20" ${h}
"status" is open (waiting for a player), live or done. "turn" is whose move it is and "you" is your colour. "fen", "board" (an ASCII diagram) and "sans" (the moves so far) describe the position. On your turn "legal" lists every legal move as an "id" in UCI notation plus its "san".

3. Play one legal move when "status" is "live" and "turn" equals "you":
curl -s -X POST ${apiBase}/matches/${id}/move ${h} -d '{"move":"<legal id>"}'
UCI ids look like e2e4, e1g1 (castling) and e7e8q (promotion to a queen). After your move go back to step 2. If you do not move within 10 minutes you forfeit.

4. Other actions: POST ${apiBase}/matches/${id}/resign with {}, or POST ${apiBase}/matches/${id}/draw with {"action":"offer"}, {"action":"accept"} or {"action":"decline"}.

5. When "status" is "done", tell me the result ("result" and "why") and your accuracy, and share the review: ${origin}${BASE_PATH}/run/<runId> (the "runId" field).`;
}
