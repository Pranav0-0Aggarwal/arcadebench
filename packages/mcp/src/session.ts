import { drawInt, GAMES, observe, PAPER_CAPS, seedCodeOf, type Game, type HelpLevel } from '@arcadebench/engine';
import type { Observation } from '@arcadebench/api';
import { PROMPT_HASH } from '@arcadebench/harness';
import { TOKENS_PER_FRAME, type Clock, type Decision, type Episode } from '@arcadebench/eval';

const FRAME_MS = 1000 / 60, MAX_TRIES = 3;

export interface Opts { help: HelpLevel; cap: number; clock?: Clock; repeat?: number; watch?: string; watchUrl?: string }
export interface Meta { agent: string; harness: string; settings: Record<string, unknown> }

export function decide(g: Game<any>, s: any, step: number, action: string, extra: Partial<Decision> = {}): Decision {
  const legal = g.legal(s);
  if (legal.length === 1) return { step, action, expert: action, agree: true, regret: 0, forced: true, invalid: false };
  const v = g.values(s);
  let expert = legal[0];
  for (const a of legal) if (v[a] > v[expert]) expert = a;
  return { step, action, expert, agree: v[action] >= v[expert] - 1e-9, regret: v[expert] - v[action], forced: false, invalid: false, ...extra };
}

export class Session {
  g: Game<any>; s: any; steps = 0; invalid = 0; misses = 0; tries = 0;
  o: Required<Opts>; decisions: Decision[] = []; actions: string[] = []; started = Date.now(); lastReply = performance.now(); written = false; onStep?: () => void;
  constructor(public id: string, public game: string, public seed: number, o: Opts, public meta: Meta) {
    this.o = { clock: 'latency', repeat: 0, watch: '', watchUrl: '', ...o };
    this.g = GAMES[game]; this.s = this.g.init(seed);
    this.skipForced();
  }
  get done() { return this.g.done(this.s) || this.steps >= this.o.cap; }
  private advance(a: string) { this.s = this.g.step(this.s, a); this.actions.push(a); this.steps++; this.onStep?.(); }

  private skipForced() {
    while (!this.done) {
      const legal = this.g.legal(this.s);
      if (legal.length !== 1) break;
      this.decisions.push(decide(this.g, this.s, this.steps, legal[0]));
      this.advance(legal[0]);
    }
  }

  observation(): Observation {
    const obs = observe(this.g, this.s, this.o.help);
    return { session: this.id, watch: this.o.watch, watchUrl: this.o.watchUrl, game: this.game, seedCode: seedCodeOf(this.game, this.seed), step: this.steps, score: this.g.score(this.s), done: this.done,
      state: obs.text, data: obs.data, legalActions: this.done ? [] : obs.actions, rules: this.steps === 0 ? this.g.rules : undefined };
  }

  view() {
    const { data, watch, watchUrl, ...v } = this.observation(), rt = this.g.realtime;
    const pace = this.o.clock === 'token' ? `while you write (${TOKENS_PER_FRAME} output tokens per frame)` : 'while you think';
    return { ...v, ...(watchUrl && { watchUrl }), game: this.g.name, clock: rt && this.o.clock !== 'none' ? `real time: the game advances ${rt.framesPerStep} frame(s) per move at 60 fps and keeps running on "${rt.defaultAction}" ${pace}` : undefined };
  }

  status() { return { session: this.id, score: this.g.score(this.s), steps: this.steps, done: this.done, invalidMoves: this.invalid }; }

  move(action: string, tokensOut?: number): string | null {
    if (this.done) return 'The game is over. Call game_status for the result.';
    const legal = this.g.legal(this.s), bad = !legal.includes(action), thinkMs = performance.now() - this.lastReply;
    if (bad) {
      this.invalid++; this.tries++;
      if (this.tries < MAX_TRIES) return `"${action}" is not a legal action. Legal actions: ${legal.join(', ')}`;
    }
    const played = bad ? legal[drawInt(this.seed, 990 + this.o.repeat, this.steps, legal.length)] : action;
    this.tries = 0;
    const d = decide(this.g, this.s, this.steps, played, { invalid: bad, latencyMs: Math.round(thinkMs), tokensOut });
    if (this.g.realtime && this.o.clock !== 'none') {
      const frames = this.o.clock === 'latency' ? Math.ceil(thinkMs / FRAME_MS) : Math.ceil((tokensOut ?? 0) / TOKENS_PER_FRAME), late = Math.floor(frames / this.g.realtime.framesPerStep);
      d.framesLate = frames;
      for (let k = 0; k < late && !this.done; k++) { this.advance(this.g.realtime.defaultAction); this.misses++; }
    }
    this.decisions.push(d);
    if (!this.done) this.advance(played);
    this.skipForced();
    this.lastReply = performance.now();
    return null;
  }

  episode(truncated: boolean): Episode {
    return { agent: this.meta.agent, harness: this.meta.harness, game: this.game, version: this.g.version, seed: this.seed, help: this.o.help, clock: this.g.realtime ? this.o.clock : 'none', repeat: this.o.repeat,
      score: this.g.score(this.s), steps: this.steps, cap: this.o.cap, capped: !this.g.done(this.s) && this.steps >= this.o.cap, truncated: truncated && !this.done,
      invalid: this.invalid, deadlineMisses: this.misses, regretExact: this.g.valuesExact, promptHash: PROMPT_HASH, settings: this.meta.settings,
      decisions: this.decisions, actions: this.actions, startedAt: new Date(this.started).toISOString(), wallMs: Date.now() - this.started };
  }
}
export const paperCap = (game: string) => PAPER_CAPS[game];
