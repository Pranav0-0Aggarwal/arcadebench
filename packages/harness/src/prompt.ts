import { createHash } from 'node:crypto';
import type { ActionInfo, Game, HelpLevel, Observation } from '@arcadebench/engine';

export const PROMPT_VERSION = 'closed-v1';
export interface Turn { action: string; scoreDelta: number }

const SYSTEM = (name: string, rules: string) => `You are playing ${name} in ArcadeBench, a benchmark that scores every move against an expert.

Rules: ${rules}

Each turn you get the current state and the legal actions. Think if you like, then end your reply with one line exactly like:
ACTION: <action id>
Use one id from the legal list, exactly as written.`;

/** stable hash of the prompt templates, recorded with every episode */
export const PROMPT_HASH = createHash('sha256').update(PROMPT_VERSION + SYSTEM('{name}', '{rules}')).digest('hex').slice(0, 12);

function describe(a: ActionInfo): string {
  let s = `- ${a.id}: ${a.label}`;
  if (a.features) s += ` | ${Object.entries(a.features).map(([k, v]) => `${k}=${+v.toFixed(3)}`).join(', ')}`;
  if (a.outcome) s += ` | outcome: score ${a.outcome.scoreDelta >= 0 ? '+' : ''}${+a.outcome.scoreDelta.toFixed(3)}, ${a.outcome.done ? 'ends the game' : 'game continues'}`;
  return s;
}

/** the official Closed-division prompt for one turn */
export function buildPrompt(g: Game<any>, obs: Observation, history: Turn[], keep = g.id === 'shifting' ? 40 : 8): { system: string; user: string } {
  const recent = history.slice(-keep);
  const hist = recent.length ? `Your recent moves, oldest first: ${recent.map((t) => `${t.action} (${t.scoreDelta >= 0 ? '+' : ''}${+t.scoreDelta.toFixed(3)})`).join(', ')}\n\n` : '';
  return { system: SYSTEM(g.name, g.rules), user: `State:\n${obs.text}\n\n${hist}Legal actions:\n${obs.actions.map(describe).join('\n')}` };
}

export type { HelpLevel };
