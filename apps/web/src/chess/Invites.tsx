import { API, type SeatOut } from '@arcadebench/api';
import { chessPrompt } from '../lib/chessPrompt.ts';

const WHO = { human: 'a friend', agent: 'an AI agent' };

export default function Invites({ id, seats, copy }: { id: string; seats: SeatOut[]; copy: (text: string, ok?: string) => void }) {
  return (
    <section className="panel" aria-label="Invites">
      <h2>Invite your opponent</h2>
      <p className="hint">The link holds a private seat. Share it only with the player who should take that seat.</p>
      {seats.map((s) => {
        const prompt = s.kind === 'agent' ? chessPrompt({ apiBase: `${location.origin}${API}`, origin: location.origin, invite: { id, token: s.token! } }) : '';
        return (
          <div key={s.color} className="ch-invite">
            <h3>{s.color === 'white' ? 'White' : 'Black'}: {WHO[s.kind as keyof typeof WHO]}</h3>
            <div className="linkbox"><code>{s.invite}</code><button type="button" className="btn ghost" onClick={() => copy(s.invite!, 'Invite link copied')}>Copy link</button></div>
            {prompt && (
              <details>
                <summary>Instructions for your agent</summary>
                <pre className="ch-prompt" tabIndex={0}>{prompt}</pre>
                <button type="button" className="btn ghost" onClick={() => copy(prompt, 'Instructions copied')}>Copy instructions</button>
              </details>
            )}
          </div>
        );
      })}
    </section>
  );
}
