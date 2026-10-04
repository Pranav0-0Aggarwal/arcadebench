#!/usr/bin/env bash
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

src=$(cd "$(dirname "$0")" && pwd)
app=/opt/arcadebench
snip=/etc/nginx/snippets/arcadebench.conf
http=/etc/nginx/conf.d/arcadebench.conf
inc="include $snip;"
site=/etc/nginx/sites-available/personal-site

command -v docker >/dev/null && docker compose version >/dev/null
id deploy >/dev/null

install -d -m 0700 -o root -g root "$app"
[ -e "$app/.env" ] || install -m 0600 -o root -g root /dev/null "$app/.env"

install -m 0755 -o root -g root "$src/arcadebench-deploy" /usr/local/sbin/arcadebench-deploy
install -m 0755 -o root -g root "$src/arcadebench-ssh" /usr/local/sbin/arcadebench-ssh
install -m 0755 -o root -g root "$src/arcadebench-backup" /usr/local/sbin/arcadebench-backup
install -m 0600 -o root -g root "$src/docker-compose.prod.yml" /opt/arcadebench/docker-compose.prod.yml
install -m 0644 -o root -g root "$src/arcadebench-backup.service" "$src/arcadebench-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now arcadebench-backup.timer

tmp=$(mktemp)
echo 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/arcadebench-deploy *' > "$tmp"
visudo -cf "$tmp" >/dev/null
install -m 0440 -o root -g root "$tmp" /etc/sudoers.d/arcadebench-deploy
rm -f "$tmp"

grep -Eq '^\s*include\s+/etc/nginx/conf\.d/\*\.conf;' /etc/nginx/nginx.conf || { echo "nginx.conf must include /etc/nginx/conf.d/*.conf in the http block" >&2; exit 1; }
install -d /etc/nginx/snippets
for f in "$snip" "$http"; do [ ! -e "$f" ] || cp -p "$f" "$f.bak"; done
install -m 0644 -o root -g root "$src/nginx-arcadebench-http.conf" "$http"
install -m 0644 -o root -g root "$src/nginx-arcadebench.conf" "$snip"
if ! nginx -t; then
  for f in "$snip" "$http"; do if [ -e "$f.bak" ]; then mv "$f.bak" "$f"; else rm -f "$f"; fi; done
  echo "nginx config test failed; previous config restored" >&2
  exit 1
fi
rm -f "$snip.bak" "$http.bak"

if grep -qF "$inc" "$site"; then
  systemctl reload nginx
  echo "nginx include present, reloaded"
else
  echo "add this line inside the 443 server block of $site, then run nginx -t and reload:"
  echo "    $inc"
fi

[ -s "$app/.env" ] || echo "fill $app/.env (root, 0600) with the app secrets before the first deploy"
