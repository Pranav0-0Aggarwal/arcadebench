export type HelpLevel = 0 | 1 | 2;
export interface Outcome { scoreDelta: number; done: boolean }
export interface ActionInfo { id: string; label: string; features?: Record<string, number>; outcome?: Outcome }
export interface Observation { text: string; actions: ActionInfo[]; data: unknown }

export interface Game<S, I extends string = string> {
  id: I;
  prefix: string;
  name: string;
  version: string;
  realtime: null | { framesPerStep: number; defaultAction: string };
  maxSteps: number;
  rules: string;
  ask?: string;
  init(seed: number): S;
  legal(s: S): string[];
  step(s: S, a: string): S;
  done(s: S): boolean;
  score(s: S): number;
  render(s: S): string;
  data(s: S): unknown;
  label?(s: S, a: string): string;
  features?(s: S, a: string): Record<string, number>;
  values(s: S): Record<string, number>;
  valuesExact: boolean;
  hidesOutcomes?: boolean;
  history?: number;
}

export function expertAction<S>(g: Game<S>, s: S): string {
  const v = g.values(s), legal = g.legal(s);
  let best = legal[0];
  for (const a of legal) if (v[a] > v[best]) best = a;
  return best;
}

export function illegal(game: string, a: string, legal: string[]): never {
  throw new Error(`${game}: illegal action "${a}"; legal: ${legal.join(', ')}`);
}
