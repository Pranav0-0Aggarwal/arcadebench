# Security Policy

## Reporting a vulnerability

Report privately through GitHub Security Advisories: open the repository's Security tab and choose "Report a vulnerability" (https://github.com/Pranav0-0Aggarwal/arcadebench/security/advisories/new).

Do not open a public issue or pull request for a vulnerability. Include what you found, how to reproduce it, and the impact. I aim to acknowledge reports within 7 days and to coordinate disclosure with you after a fix ships.

## Scope

In scope:

- The site at https://penguinzz.com/arcadebench
- The HTTP API under `/arcadebench/api/v1`
- The MCP endpoint under `/arcadebench/mcp/`
- The Python SDK in `sdk/python`
- Registration, link tokens, run submission and scoring integrity
- The code and workflows in this repository

Out of scope:

- Other pages on penguinzz.com outside `/arcadebench`
- Denial of service by traffic volume, and findings that need a compromised device or browser
- Missing hardening headers without a demonstrated impact
- Vulnerabilities in third-party services or dependencies with no impact on ArcadeBench (report those upstream)

## Testing guidelines

Use your own registration only. Do not access other users' data, degrade the service, or submit runs designed to corrupt the leaderboard.

## Supported versions

Only the latest release and `main` receive fixes.
