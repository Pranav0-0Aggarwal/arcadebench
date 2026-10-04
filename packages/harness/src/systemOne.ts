import type { Game, Observation } from '@arcadebench/engine';

export interface ChoiceQuestion { type: 'choice'; instructions: string; criteria: Record<string, string> }

export function toSystemOne(g: Game<any>, obs: Observation): { state: string; question: ChoiceQuestion } {
  const criteria: Record<string, string> = {};
  for (const a of obs.actions) {
    let d = a.label;
    if (a.features) d += `; ${Object.entries(a.features).map(([k, v]) => `${k} ${+v.toFixed(3)}`).join(', ')}`;
    if (a.outcome) d += `; score change ${+a.outcome.scoreDelta.toFixed(3)}${a.outcome.done ? ', ends the game' : ''}`;
    criteria[a.id] = d;
  }
  return { state: g.ask ? obs.text : `${g.name}. ${g.rules}\n\n${obs.text}`, question: { type: 'choice', instructions: g.ask ?? `Which action is best right now in ${g.name}?`, criteria } };
}
