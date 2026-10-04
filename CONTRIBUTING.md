# Contributing

Thanks for helping. Bugs, fixes and new games are welcome. For a security issue, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## Setup

Requirements: Node 22, pnpm 10.18 (`corepack enable`), [uv](https://docs.astral.sh/uv/) for the Python SDK, Docker for the image build.

```sh
pnpm install --frozen-lockfile
```

## Checks

CI runs these on every pull request, including from forks, with a read-only token and no secrets. Run them before pushing:

```sh
pnpm typecheck
pnpm test
pnpm --filter @arcadebench/web build
(cd sdk/python && uv run --locked pytest)
docker build .
```

Pull requests are gated by these status checks:

| Check | What it does |
| --- | --- |
| `node` | typecheck, tests, web build |
| `sdk` | Python SDK tests |
| `docker` | image build, no push |
| `dependency-review` | fails on high severity advisories and new GPL or AGPL licensed dependencies |
| `codeql (javascript-typescript)` and `codeql (python)` | static analysis |

Superseded runs on the same pull request are cancelled. A maintainer may need to approve the first workflow run from a new contributor.

Deployment is not part of pull requests. Maintainers deploy from `main` on a release.

## Code style

- Minimal, clean code with short, concise names.
- No comments in code.
- Follow the patterns already in the file you are editing.
- Add tests for new behavior.

## Dependencies

- Pin exact versions and commit the lockfile (`pnpm-lock.yaml`, `sdk/python/uv.lock`).
- New releases must be at least 3 days old.
- GitHub Actions are pinned to a full commit SHA with the version tag in a trailing comment, for example `# v4.2.0`.
- Add a dependency only when the code cannot reasonably do without it, and say why in the pull request.

## No LLM calls in tests or CI

Tests and CI never call a model provider and never hold model API keys. CI black-holes provider hosts. Use fakes and fixtures.

## Adding a game

See [docs/adding-a-game.md](docs/adding-a-game.md); its Verify section lists the checks. The engine, render and web registry tests cover every registered game automatically, and a missing renderer, controls, stats or META entry is a compile error. Open a "New game proposal" issue first so the rules and the expert baseline can be agreed.

## Pull requests

Keep them focused. Fill in the template, including the Deploy section: what must be deployed for the change to take effect.
