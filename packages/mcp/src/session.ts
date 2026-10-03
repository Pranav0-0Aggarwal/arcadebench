import { drawInt, GAMES, observe, PAPER_CAPS, seedCodeOf, type Game, type HelpLevel } from '@arcadebench/engine';
import { PROMPT_HASH } from '@arcadebench/harness';
import type { Decision, Episode } from '@arcadebench/eval';

const FRAME_MS = 1000 / 60, MAX_TRIES = 3;

/** One locked game session for a harness run: fixed game and seed, no restarts, every move recorded like the bare runner. */
export class Session {
  g: Game<any>; s: any; steps = 0; invalid = 0; misses = 0; tries = 0;
  decisions: Decision[] = []; actions: string[] = []; started = Date.now(); lastReply = performance.now(); written = false;
  constructor(public id: string, public game: string, public seed: number, public help: HelpLevel, public cap: number, public meta: { agent: string; harness: string; settings: Record<string, unknown> }) {
    this.g = GAMES[game]; this.s = this.g.init(seed);
  }
  get done() { return this.g.done(this.s) || this.steps >= this.cap; }
  private advance(a: string) { this.s = this.g.step(this.s, a); this.actions.push(a); this.steps++; }

  /** forced moves are played automatically so the agent only sees real choices */
  private skipForced() {
    while (!this.done) {
      const legal = this.g.legal(this.s);
      if (legal.length !== 1) break;
      this.decisions.push({ step: this.steps, action: legal[0], expert: legal[0], agree: true, regret: 0, forced: true, invalid: false });
      this.advance(legal[0]);
    }
  }

  view() {
    this.skipForced();
    const obs = observe(this.g, this.s, this.help);
    this.lastReply = performance.now();
    return { session: this.id, game: this.g.name, seedCode: seedCodeOf(this.game, this.seed), step: this.steps, score: this.g.score(this.s), done: this.done,
      state: obs.text, legalActions: this.done ? [] : obs.actions, rules: this.steps === 0 ? this.g.rules : undefined,
      clock: this.g.realtime ? `real time: the game advances ${this.g.realtime.framesPerStep} frame(s) per move at 60 fps and keeps running on "${this.g.realtime.defaultAction}" while you think` : undefined };
  }

  move(action: string): { ok: boolean; error?: string; result?: ReturnType<Session['view']> } {
    if (this.done) return { ok: false, error: 'The game is over. Call game_status for the result.' };
    this.skipForced();
    const legal = this.g.legal(this.s), values = this.g.values(this.s);
    let expert = legal[0]; for (const a of legal) if (values[a] > values[expert]) expert = a;
    const thinkMs = performance.now() - this.lastReply;
    const bad = !legal.includes(action);
    if (bad) {
      this.invalid++; this.tries++;
      if (this.tries < MAX_TRIES) { this.lastReply = performance.now(); return { ok: false, error: `"${action}" is not a legal action. Legal actions: ${legal.join(', ')}` }; }
    }
    const played = bad ? legal[drawInt(this.seed, 990, this.steps, legal.length)] : action;
    this.tries = 0;
    const d: Decision = { step: this.steps, action: played, expert, agree: values[played] >= values[expert] - 1e-9, regret: values[expert] - values[played], forced: false, invalid: bad, latencyMs: Math.round(thinkMs) };
    if (this.g.realtime) {
      const frames = Math.ceil(thinkMs / FRAME_MS), late = Math.floor(frames / this.g.realtime.framesPerStep);
      d.framesLate = frames;
      for (let k = 0; k < late && !this.done; k++) { this.advance(this.g.realtime.defaultAction); this.misses++; }
    }
    this.decisions.push(d);
    if (!this.done) this.advance(played);
    return { ok: true, result: this.view() };
  }

  episode(truncated: boolean): Episode {
    return { agent: this.meta.agent, harness: this.meta.harness, game: this.game, version: this.g.version, seed: this.seed, help: this.help, clock: this.g.realtime ? 'latency' : 'none', repeat: +(this.meta.settings.repeat ?? 0),
      score: this.g.score(this.s), steps: this.steps, cap: this.cap, capped: !this.g.done(this.s) && this.steps >= this.cap, truncated: truncated && !this.done,
      invalid: this.invalid, deadlineMisses: this.misses, regretExact: this.g.valuesExact, promptHash: PROMPT_HASH, settings: this.meta.settings,
      decisions: this.decisions, actions: this.actions, startedAt: new Date(this.started).toISOString(), wallMs: Date.now() - this.started };
  }
}
export const paperCap = (game: string) => PAPER_CAPS[game];
