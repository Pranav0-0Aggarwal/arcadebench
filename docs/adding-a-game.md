# Adding a game

A game is one pure, seeded object that implements `Game<S, I>` (`packages/engine/src/core/types.ts`). Everything else (server, MCP, Python SDK, harness, leaderboards, Methodology tables, the Connect picker, the Play, Arena and Watch pages) reads the engine registry, so a new game appears there once it is registered. Three tables in the front end and the renderer are the only per-game code besides the engine file, and the compiler tells you when one is missing.

## What to add

| # | File | What | If you forget |
| - | ---- | ---- | ------------- |
| 1 | `packages/engine/src/games/<id>.ts` | the `Game` object | nothing runs |
| 2 | `packages/engine/src/index.ts` | import it and add it to `classics`, `originals` or `lab` | not registered |
| 3 | `packages/render/src/games/<id>.ts` and `packages/render/src/index.ts` | canvas `Renderer` (`dims`, `draw`, optional `hit` for clicks) | compile error (`RENDERERS`) |
| 4 | `packages/render/src/stats.ts` | the head and rows shown on share cards and clips | compile error (`STATS`) |
| 5 | `apps/web/src/game/controls.ts` | keyboard and touch controls for human play | compile error (`CONTROLS`) |
| 6 | `apps/web/src/components/games.ts` | `META`: skills, cap and expert copy, `pace` (ms per move on the home page, turn-based only), `data` (dataset id) | compile error (`META`) |
| 7 | `packages/engine/src/games/<id>.test.ts` | `gameContract(...)` with thresholds for your game, plus tests of its own rules | no golden snapshot, no quality check |

The group in step 2 decides where the game shows up. Classics are well-known games, originals are invented ones, Decision Lab is one decision per item scored against a dataset label. Real-time classics are grouped as Runners on the latency track.

Nothing else needs editing. Tiles, tables, leaderboard tabs, daily seeds, the `/games` API, `list_games`, seed codes, harness prompts and the Python SDK are all derived. If a count in UI copy changes, it is computed from the registry. Editorial paragraphs that describe specific games (the originals and Decision Lab blurbs on the home page, the Decision Lab section of Methodology, the scenes in `apps/web/src/lab`) are written by hand, so update them if your game belongs in one.

Run the checks below after each step. A new game is covered by `packages/engine/src/registry.test.ts`, `packages/render/src/render.test.ts` and `apps/web/src/registry.test.ts` as soon as it is registered, without adding any test code.

## The `Game` contract

| Field | Meaning |
| ----- | ------- |
| `id`, `name` | `id` is a lowercase slug, stable forever (it is stored in runs and URLs). Declare it twice: as the `id` value and as the second type argument, `Game<MyState, 'my-id'>`, so `GameId` stays a literal union. |
| `prefix` | three characters from `A-Z0-9`, unique across games; starts every seed code (`TET-0413-X7QD`). |
| `version` | `major.minor.patch`. Bump the **major** whenever outcomes change for the same seed (rules, RNG use, scoring, expert): it invalidates old seed codes, reference scores and leaderboard rows. Minor and patch are for changes that leave outcomes identical. |
| `realtime` | `null` for turn-based. For real-time games `{ framesPerStep, defaultAction }`: the harness advances idle frames with `defaultAction`, and `controls.ts` needs `act` and `start`. |
| `maxSteps` | the episode cap. Random play must reach `done` within it. |
| `rules`, `ask?` | the text agents read. `ask` makes the game a System One classification question. |
| `init(seed)`, `step(s, a)` | `step` returns a new state, never mutates `s`, and throws through `illegal(...)` for ids not in `legal(s)`. |
| `legal(s)` | unique ids, at most 64 characters, matching `[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*` so the harness can parse `ACTION: <id>`, and distinct ignoring case. |
| `done(s)`, `score(s)` | the score is what the leaderboard normalizes between the random and expert baselines, so the expert must score clearly above random. |
| `render(s)` | the text observation. |
| `data(s)` | JSON-clean state for the canvas renderer: numbers must be finite, no `Map` or `Set`. |
| `label?`, `features?` | action descriptions (help level 1 adds `features`; help level 2 adds each action's outcome unless `hidesOutcomes`). |
| `values(s)`, `valuesExact` | one number per legal action, higher is better. See below. |
| `history?` | how many recent moves the prompt shows (default 8). Raise it for games that need to learn from what just happened, as Shifting Rules does. |

State and randomness: the whole state is a plain object that carries the `seed`. Never call `Math.random` or `Date`. Draw from `drawInt(seed, stream, i, n)`, `draw` or `shuffle` in `core/rng.ts`, where `stream` names the purpose and `i` is a counter that depends only on game progress (a round number, a placement count), never on how many draws happened before. That keeps a game's randomness independent of the order in which things are looked at.

Picking a stream: streams are small integers, one per independent purpose inside a game (apple placement, obstacle rows, piece order), and must not repeat within a game. By convention each game takes fresh numbers; 22 is the highest in use, so start at 23 and count up.

## Experts and values

`values(s)` is the expert. The expert plays `argmax` of it (ties go to the first legal action), and a player's regret on a move is the best value minus the value of the move they played; a move is forced, with zero regret, when only one action is legal. The normalized score is `(score - random) / (expert - random)`, with `random` the mean over 20 random runs, capped at 1.5. A seed where the expert does not beat random is dropped from the leaderboard, so make sure it does.

- `valuesExact: true` when the values are the true optimum (a solver, or the dataset label as in Decision Lab). Methodology labels such an expert `exact`.
- `valuesExact: false` for a heuristic or depth-limited search. Say so in the `META.expert` copy.
- Values need only rank actions; keep them cheap. Games with a slow expert (search) are costly for the server, which replays every verified run.

## Verify

```
pnpm -s typecheck
pnpm -s vitest run
(cd apps/web && npx tsc -p tsconfig.json --noEmit && npx vite build)
(cd sdk/python && uv run pytest -q)
```

`registry.test.ts` runs for every game and checks: unique id and prefix, seed-code round trip, determinism by seed, replaying an action log, pure `step`, legal ids valid and rejecting unknown ones, values covering exactly the legal actions, a legal expert move, `done` within `maxSteps` under random play, `render` and `data` safe at every sampled state and every help level, and an expert that does not trail random play.

`gameContract` (`core/contract.ts`) adds the checks that need per-game thresholds: a golden run (the first `vitest run` writes `__snapshots__/<id>.test.ts.snap`; commit it), the expert beating random by `margin` and `ratio`, and the null policy (always the first legal action) not beating the expert. Start from your game's baselines:

```
npx tsx scripts/baselines.ts <id> [seeds] [cap]
```

It prints the mean expert, random and null scores and the expert's milliseconds per game. Set `margin` and `ratio` a little under what you see.

Check the game in the browser too (`/play/<id>`, `/watch`, the home page tile) for the renderer and controls.

## Example: Card Duel

Each round shows two cards; pick the higher one. It is deliberately tiny and uses stream 23.

`packages/engine/src/games/duel.ts`

```ts
import { drawInt } from '../core/rng.ts';
import { illegal, type Game } from '../core/types.ts';

const ROUNDS = 20, ACTIONS = ['left', 'right'];
export interface DuelState { seed: number; round: number; score: number }
const cards = (seed: number, k: number) => [drawInt(seed, 23, 2 * k, 100), drawInt(seed, 23, 2 * k + 1, 100)];

export const duel: Game<DuelState, 'duel'> = {
  id: 'duel', prefix: 'DUL', name: 'Card Duel', version: '1.0.0', realtime: null, maxSteps: ROUNDS,
  rules: `Card Duel. Each round shows two cards numbered 0 to 99. Pick the higher one, left or right, for one point. ${ROUNDS} rounds.`,
  init: (seed) => ({ seed, round: 0, score: 0 }),
  legal: () => [...ACTIONS],
  step(s, a) {
    if (!ACTIONS.includes(a)) illegal('duel', a, ACTIONS);
    const [l, r] = cards(s.seed, s.round);
    return { ...s, round: s.round + 1, score: s.score + +(a === 'left' ? l >= r : r >= l) };
  },
  done: (s) => s.round >= ROUNDS,
  score: (s) => s.score,
  render(s) {
    const [l, r] = cards(s.seed, s.round);
    return `Round ${s.round + 1} of ${ROUNDS}. Left card ${l}, right card ${r}. Score ${s.score}.`;
  },
  data: (s) => ({ cards: cards(s.seed, s.round), round: s.round, score: s.score }),
  values(s) {
    const [l, r] = cards(s.seed, s.round);
    return { left: +(l >= r), right: +(r >= l) };
  },
  valuesExact: true,
};
```

`packages/engine/src/games/duel.test.ts`

```ts
import { describe } from 'vitest';
import { gameContract } from '../core/contract.ts';
import { duel } from './duel.ts';

describe('duel', () => {
  gameContract(duel, { seeds: 10, margin: 3, ratio: 1.5 });
});
```

`packages/engine/src/index.ts`: add `import { duel } from './games/duel.ts';` and put `duel` in the list, for example `const originals = [shifting, beams, courier, duel] as const;`.

`packages/render/src/games/duel.ts`

```ts
import { C, MONO, screen, text, type Renderer } from '../frame.ts';

export const duel: Renderer = {
  dims: [8, 6],
  draw(g, d, w, h, o) {
    const { cs, P } = screen(g, w, h, 8, 6, [['score', String(d.score)], ['round', `${d.round}/20`]]);
    (d.cards as number[]).forEach((n, i) => {
      const [x, y] = P(2 + i * 4, 3);
      text(g, String(n), x, y, `600 ${cs * 1.4}px ${MONO}`, o.intent === (i ? 'right' : 'left') ? C.blue : C.ink, 'center', 'middle');
    });
  },
};
```

`packages/render/src/index.ts`: add `import { duel } from './games/duel.ts';` and `duel` to `RENDERERS`.

`packages/render/src/stats.ts`, inside `STATS`:

```ts
duel: (d) => ({ head: ['score', n(d.score)], rows: [['round', `${d.round}/20`]] }),
```

`apps/web/src/game/controls.ts`, inside `CONTROLS`:

```ts
duel: direct('Left or Right arrow picks the higher card.', { ArrowLeft: 'left', ArrowRight: 'right' }, [['ArrowLeft', '←', 'Left'], null, ['ArrowRight', '→', 'Right']]),
```

`apps/web/src/components/games.ts`, inside `META`:

```ts
duel: { skills: 'arithmetic', cap: '20 rounds', expert: 'Picks the higher card (exact)', pace: 600 },
```

For richer input use the other helpers in `controls.ts`: `choose` for pick-one games, a custom `Ctl` for cursors, flags or held keys, and `act` and `start` for real-time games. Dataset-backed tasks are built with `labelled(...)` in `games/labelled.ts` (see `sorter.ts`), add the dataset to `apps/web/src/components/datasets.ts` and name its id in `META.data`.

## Things to know

- Daily seeds are drawn per game from its position in the registry (`Object.keys(GAMES)`), so inserting a game before existing ones changes their daily seeds from that day on. Add new games at the end of the last group, or accept the one-time shift.
- `packages/render/src/stats.ts` writes a few caps by hand (for example `/216` for Minesweeper). Keep them in step with the engine when you change a game's size.
- README, launch material and any other prose that quotes the number of games is not generated; the UI copy is.
