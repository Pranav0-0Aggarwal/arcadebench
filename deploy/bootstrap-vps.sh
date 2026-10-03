#!/usr/bin/env bash
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

src=$(cd "$(dirname "$0")" && pwd)
app=/opt/arcadebench
snip=/etc/nginx/snippets/arcadebench.conf
inc="include $snip;"
site=/etc/nginx/sites-available/personal-site

command -v docker >/dev/null && docker compose version >/dev/null
id deploy >/dev/null

install -d -m 0700 -o root -g root "$app"
[ -e "$app/.env" ] || install -m 0600 -o root -g root /dev/null "$app/.env"

install -m 0755 -o root -g root "$src/arcadebench-deploy" /usr/local/sbin/arcadebench-deploy
install -m 0755 -o root -g root "$src/arcadebench-ssh" /usr/local/sbin/arcadebench-ssh
install -m 0600 -o root -g root "$src/docker-compose.prod.yml" /opt/arcadebench/docker-compose.prod.yml

tmp=$(mktemp)
echo 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/arcadebench-deploy *' > "$tmp"
visudo -cf "$tmp" >/dev/null
install -m 0440 -o root -g root "$tmp" /etc/sudoers.d/arcadebench-deploy
rm -f "$tmp"

install -d /etc/nginx/snippets
install -m 0644 -o root -g root "$src/nginx-arcadebench.conf" "$snip"
nginx -t

if grep -qF "$inc" "$site"; then
  systemctl reload nginx
  echo "nginx include present, reloaded"
else
  echo "add this line inside the 443 server block of $site, then run nginx -t and reload:"
  echo "    $inc"
fi

[ -s "$app/.env" ] || echo "fill $app/.env (root, 0600) with the app secrets before the first deploy"
