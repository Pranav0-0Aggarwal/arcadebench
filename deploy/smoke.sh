#!/usr/bin/env bash
set -euo pipefail

base=${1:?usage: smoke.sh <base_url>}
api=${base%/}/api/v1
auth=()
[ -z "${AB_TOKEN:-}" ] || auth=(-H "Authorization: Bearer $AB_TOKEN")

get() { curl -fsS --max-time 20 ${auth[@]+"${auth[@]}"} "$api$1"; }
post() { curl -fsS --max-time 20 ${auth[@]+"${auth[@]}"} -H 'content-type: application/json' -d "$2" "$api$1"; }
fail() { echo "smoke failed: $*" >&2; exit 1; }

curl -fsS --max-time 20 --retry 10 --retry-delay 3 --retry-all-errors "$api/health" >/dev/null

game=$(get /games | jq -r 'min_by(.cap) | .id')
obs=$(post /sessions "{\"game\":\"$game\",\"mode\":\"practice\",\"seed\":1}")
sid=$(jq -r .session <<<"$obs")
code=$(jq -r .seedCode <<<"$obs")

acts=()
while [ "$(jq .done <<<"$obs")" = false ]; do
  [ ${#acts[@]} -lt 5000 ] || fail "game did not finish"
  a=$(jq -r '.legalActions[0].id' <<<"$obs")
  acts+=("$a")
  obs=$(post "/sessions/$sid/move" "$(jq -n --arg a "$a" '{action:$a}')")
  [ "$(jq 'has("invalid")' <<<"$obs")" = false ] || fail "invalid move $a"
done
score=$(jq .score <<<"$obs")

req=$(jq -n --arg g "$game" --arg c "$code" --args '{game:$g,seedCode:$c,actions:$ARGS.positional}' "${acts[@]}")
run=$(post /practice/verify "$req" | jq -r .runId)
[ -n "$run" ] && [ "$run" != null ] || fail "no run id"

stored=$(get "/runs/$run")
[ "$(jq -r .id <<<"$stored")" = "$run" ] || fail "run $run not stored"
[ "$(jq .score <<<"$stored")" = "$score" ] || fail "stored score differs from played score"
echo "ok: $game $code run $run score $score"
