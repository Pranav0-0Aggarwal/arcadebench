import type { ActionInfo, Game, HelpLevel, Observation, Outcome } from './types.ts';

/** L2 outcome of one action. Real-time games roll forward ~30 frames on the default action so death is visible. */
export function outcomeOf<S>(g: Game<S>, s: S, a: string): Outcome {
  let n = g.step(s, a);
  if (g.realtime) {
    const k = Math.ceil(30 / g.realtime.framesPerStep);
    for (let i = 0; i < k && !g.done(n); i++) n = g.step(n, g.realtime.defaultAction);
  }
  return { scoreDelta: g.score(n) - g.score(s), done: g.done(n) };
}

export function observe<S>(g: Game<S>, s: S, help: HelpLevel): Observation {
  const actions = g.legal(s).map((id) => {
    const a: ActionInfo = { id, label: g.label ? g.label(s, id) : id };
    if (help >= 1 && g.features) a.features = g.features(s, id);
    if (help >= 2) a.outcome = outcomeOf(g, s, id);
    return a;
  });
  return { text: g.render(s), actions, data: g.data(s) };
}

/** Re-simulates a recorded action list from the seed. */
export function replay<S>(g: Game<S>, seed: number, actions: string[]): S {
  let s = g.init(seed);
  for (const a of actions) {
    if (g.done(s)) break;
    s = g.step(s, a);
  }
  return s;
}

/** Stable hash of any JSON-safe value, for golden tests. */
export function stateHash(v: unknown): string {
  const str = JSON.stringify(v);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}
