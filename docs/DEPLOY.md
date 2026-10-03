# Deploy

Production is one container (`apps/server` serving `apps/web/dist`) on the VPS, published on `127.0.0.1:8790` and proxied by the existing nginx at `https://penguinzz.com/arcadebench/`.

## Secrets

In the GitHub repo, create an environment `production` (add required reviewers) with:

- `VPS_HOST`: VPS address
- `VPS_USER`: `deploy`
- `VPS_SSH_KEY`: private key whose public half is in the `deploy` user's `authorized_keys`
- `VPS_KNOWN_HOSTS`: output of `ssh-keyscan -t ed25519 <host>`, verified against the host's fingerprint

App secrets (for example `DEEPSEEK_API_KEY`) live only in `/opt/arcadebench/.env` on the VPS (root, 0600).

PyPI: add a trusted publisher for the `arcadebench` project with workflow `release-sdk.yml` and environment `pypi`. No token is stored.

## Release

Publishing a GitHub release runs `deploy.yml` and `release-sdk.yml`.

1. `ci.yml` runs as a required job.
2. The image is built on the runner and pushed to `ghcr.io/pranav0-0aggarwal/arcadebench` tagged with the commit SHA and the release tag, never `latest`.
3. Over SSH (strict host keys), `sudo /usr/local/sbin/arcadebench-deploy <sha>` receives only the job's short-lived GHCR token on stdin and uses the root-owned `/opt/arcadebench/docker-compose.prod.yml` installed by the bootstrap (changes to the compose file ship by re-running the bootstrap, never through CI), logs in to GHCR, pulls, runs `migrate` once, runs `up -d --wait`, logs out, and prunes all images except the current and previous tags.
4. `deploy/smoke.sh https://penguinzz.com/arcadebench` checks health and plays one practice game with a fixed seed, then verifies the stored run id.
5. On failure the previous SHA is redeployed through the same script and the job fails.

Actions > deploy > Run workflow on `main` redeploys. Leave `tag` empty to build and deploy that commit.

## Roll back

Actions > deploy > Run workflow on `main` with `tag` set to a commit SHA or `vX.Y.Z` whose image is still on the VPS (current and previous only) or in GHCR. Images missing on the VPS are pulled from GHCR.

On the VPS, `sudo /usr/local/sbin/arcadebench-deploy current` prints the running tag.

## Bootstrap

Run once as a sudoer. It is idempotent and prints no secrets.

```
scp -r deploy <host>:/tmp/ab-deploy
ssh <host> 'sudo bash /tmp/ab-deploy/bootstrap-vps.sh'
```

It checks that the `deploy` user, docker and compose exist, keeps `/opt/arcadebench` (root, 0700) and an empty `.env` if absent, installs `/usr/local/sbin/arcadebench-deploy` and the sudoers drop-in `/etc/sudoers.d/arcadebench-deploy` (validated with `visudo -cf`), installs `/etc/nginx/snippets/arcadebench.conf` and runs `nginx -t`. The `deploy` user is not added to the docker group.

Then add this line inside the `443` server block of `/etc/nginx/sites-available/personal-site`, run `nginx -t` and reload (rerunning the bootstrap reloads once the line exists):

```
include /etc/nginx/snippets/arcadebench.conf;
```

`nginx -t` must pass before reload. Finally fill `/opt/arcadebench/.env`.

## Local image check

```
docker build -t arcadebench:local .
docker run --rm -p 8790:8787 -v "$(mktemp -d)":/data arcadebench:local
```
