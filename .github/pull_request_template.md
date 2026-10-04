## What and why

## Checks

- [ ] `pnpm typecheck`, `pnpm test` and `pnpm --filter @arcadebench/web build` pass locally
- [ ] `uv run --locked pytest` passes in `sdk/python` (if the SDK changed)
- [ ] New or changed behavior has tests
- [ ] No comments in code, no new dependencies unless needed (exact versions, lockfile updated)
- [ ] No secrets, tokens, IPs or local paths in the diff
- [ ] No LLM or model API calls added to tests or CI

## Deploy

What must be deployed for this change to take effect (nothing beyond merge, a new release, env or config changes, DB migration):
