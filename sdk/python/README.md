# arcadebench

Python SDK and CLI for [ArcadeBench](https://penguinzz.com/arcadebench): seeded arcade games played through the hosted API, every move scored against an expert. Your model is called locally with your own key; only game moves go to ArcadeBench.

Zero runtime dependencies. Python 3.10+.

## Install

```sh
pip install arcadebench
```

Until it is published, from a checkout of the repo:

```sh
uv pip install -e sdk/python
```

## Quick start

Register at `/connect` to get your private link token, then:

```sh
export OPENAI_API_KEY=...
arcadebench play --link <token> --model openai:gpt-4.1 --games tetris,snake --seeds 0-4
```

Practice mode (the default) plays public seeds; the server re-simulates every action log. Benchmark mode counts toward your scorecard: every run gets a fresh random seed, shown openly, and each game keeps going until the score is precise enough, then replays its first 3 seeds as a repeat check:

```sh
arcadebench play --link <token> --model anthropic:<model> --mode benchmark
```

Seeds are drawn by the server, so `--seeds` applies to practice only. When a game is finished the server answers HTTP 409 ("benchmark complete for <game>") and the script moves on. Each game start prints `watch live: <url>`; open it to follow the game as it is played. `--mode ranked` is a legacy alias for `benchmark`.

## Options

| Option | Meaning |
| --- | --- |
| `--link <token>` | your private link token (required) |
| `--model <spec>` | model to play with (see below) |
| `--adapter path.py` | System One model instead of `--model` |
| `--games all\|tetris,snake` | games to play (default `all`) |
| `--mode benchmark\|practice` | default `practice` (`ranked` is an alias for `benchmark`) |
| `--seeds 0-9` | practice seeds, e.g. `0-9` or `1,4,7-9` (default `0-9`) |
| `--help N` | observation help level 0, 1 or 2 (default 0) |
| `--clock none\|latency\|token` | clock for real-time games (default `none`) |
| `--concurrency N` | games in flight at once (default 1; the server allows 8 open sessions per token) |
| `--thinking` | opt in to provider thinking or reasoning |
| `--api <base>` | API base (default `https://penguinzz.com/arcadebench/api/v1`) |

`-h` prints usage.

## Model specs

| Spec | Provider | Key |
| --- | --- | --- |
| `openai:<model>` | OpenAI chat completions | `OPENAI_API_KEY` |
| `anthropic:<model>` | Anthropic messages | `ANTHROPIC_API_KEY` |
| `deepseek:<model>` | DeepSeek | `DEEPSEEK_API_KEY` |
| `ollama:<model>` | local Ollama (`OLLAMA_HOST`, default `127.0.0.1:11434`) | none |
| `compat:<model>@<base_url>` | any OpenAI-compatible server, e.g. `compat:llama3@http://localhost:8000/v1` | `ARCADEBENCH_COMPAT_KEY` (optional) |

The Closed-division prompt is the official one, reproduced byte for byte and checked against the TypeScript implementation by the test suite. Replies must end with `ACTION: <id>`; an unparseable reply sends the empty action, which the server counts as invalid.

### System One models

`--adapter path.py` loads a module exposing `NAME`, `load()` and `predict(model, state, question)` and asks it the System One choice question built from each observation. See `research/pilot/adapter_kai.py` in the repo. The adapter is Python code that runs on your machine, so only load files you trust.

## Determinism

Defaults are chosen for low run-to-run variance, and the settings actually used are printed at the start of every run:

| Provider | Default | With `--thinking` |
| --- | --- | --- |
| OpenAI | `temperature 0`, `seed 0` | `reasoning_effort medium`, no temperature |
| Anthropic | `temperature 0`, no thinking | extended thinking, 8000 token budget |
| DeepSeek | `temperature 0`, `thinking: disabled` | `thinking: enabled` |
| Ollama | `think false`, `temperature 0`, `seed 0` | `think true` |
| compat | `temperature 0`, `seed 0` | not supported |

OpenAI models that cannot run without reasoning reject `temperature`; use `--thinking` with them. Providers only honour `seed` on a best-effort basis. Each move sends `tokensOut` (the provider's reported output tokens) for the token clock.

Requests to ArcadeBench and to providers retry with backoff on 429, 5xx and network errors (honouring Retry-After); a retried move carries its step, so the server never plays it twice. If a game session expires mid-game the script reports it and moves on. Ctrl-C ends the run cleanly (a second Ctrl-C kills it immediately); the server stores the truncated run.

## Privacy

Provider keys are read from environment variables only and are sent only to the provider's URL, never to ArcadeBench. The link token is sent only to the ArcadeBench API.

## Development

```sh
cd sdk/python
uv run pytest
```

`tests/vectors.json` is generated from the TypeScript harness; after changing the prompt or parser, regenerate it from the repo root with `npx tsx sdk/python/tests/make_vectors.ts`.

## Releasing

Releases use PyPI trusted publishing: configure a trusted publisher for `arcadebench` on PyPI pointing at the repository's release workflow, which runs `uv build` in `sdk/python` and publishes `dist/` with `pypa/gh-action-pypi-publish` (pinned by SHA). No tokens are stored in the repository.
