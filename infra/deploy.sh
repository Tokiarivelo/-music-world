#!/usr/bin/env bash
# Deploy Music World to the server over ssh (skill deploy-ovh, runbook infra/README.md § Deploy).
# Usage (from the repository root, via `make deploy`):
#   DEPLOY_HOST=ubuntu@<ip-or-name> [DEPLOY_DIR=music-world] [DEPLOY_REF=<sha|branch>] [DEPLOY_DOMAIN=<domain>] \
#   [DRY_RUN=1] bash infra/deploy.sh
# The server holds a clone of the repository in ~/$DEPLOY_DIR and its own infra/.env (never copied by this script).
# Steps: resolve the ref (must be pushed) → server: checkout, check-env, disk check, build, up -d (the api runs
# `alembic upgrade head` before uvicorn), wait for healthy → public /api/ready. Prints the rollback command.
set -euo pipefail

: "${DEPLOY_HOST:?set DEPLOY_HOST=user@host (the OVHcloud instance)}"
DEPLOY_DIR="${DEPLOY_DIR:-music-world}"
DEPLOY_REF="${DEPLOY_REF:-origin/main}"
DRY_RUN="${DRY_RUN:-0}"
HEALTH_TIMEOUT_SEC="${HEALTH_TIMEOUT_SEC:-600}"

[[ "$DRY_RUN" == "1" ]] || git fetch --quiet origin
sha="$(git rev-parse --verify "$DEPLOY_REF^{commit}")"
if [[ -z "$(git branch -r --contains "$sha" 2>/dev/null)" ]]; then
  echo "deploy: $sha is not on any remote branch: push it first" >&2
  exit 1
fi
echo "deploy: $sha ($(git log -1 --format=%s "$sha")) → $DEPLOY_HOST:~/$DEPLOY_DIR"

# Runs on the server. Arguments: dir, sha, health timeout. Kept in one quoted heredoc: no local expansion.
read -r -d '' REMOTE <<'REMOTE_SCRIPT' || true
set -euo pipefail
dir="$1" sha="$2" timeout="$3"
cd "$HOME/$dir"
compose=(docker compose -f infra/docker-compose.yml)
previous="$(git rev-parse HEAD)"
echo "server: previous commit $previous"
git fetch --quiet origin
git -c advice.detachedHead=false checkout --quiet --detach "$sha"
infra/scripts/check-env.sh infra/.env
infra/scripts/check-disk.sh 90 || echo "server: disk is getting full, prune images after the deploy"
"${compose[@]}" build --pull
"${compose[@]}" up -d --remove-orphans
deadline=$((SECONDS + timeout))
while true; do
  states="$("${compose[@]}" ps -a --format '{{.Service}} {{.Status}}')"
  if [[ -n "$states" ]] && ! grep -qvE '\(healthy\)' <<<"$states"; then break; fi
  if grep -qE 'unhealthy|Exited|Restarting' <<<"$states" || ((SECONDS > deadline)); then
    echo "server: services not healthy:"; echo "$states"
    "${compose[@]}" logs --tail=50 api worker
    echo "server: roll back with DEPLOY_REF=$previous make deploy"
    exit 1
  fi
  sleep 5
done
echo "$previous" >.deploy-previous
echo "server: all services healthy at $sha (previous $previous)"
REMOTE_SCRIPT

if [[ "$DRY_RUN" == "1" ]]; then
  echo "--- DRY_RUN: would run on $DEPLOY_HOST with args ($DEPLOY_DIR $sha $HEALTH_TIMEOUT_SEC):"
  echo "$REMOTE"
  exit 0
fi

ssh -o BatchMode=yes "$DEPLOY_HOST" bash -s -- "$DEPLOY_DIR" "$sha" "$HEALTH_TIMEOUT_SEC" <<<"$REMOTE"

if [[ -n "${DEPLOY_DOMAIN:-}" ]]; then
  curl -fsS --retry 5 --retry-delay 5 --retry-all-errors "https://$DEPLOY_DOMAIN/api/ready" >/dev/null
  echo "deploy: https://$DEPLOY_DOMAIN/api/ready OK"
fi
echo "deploy: done. Next: skill deploy-ovh § Verify (demo song, upload, director, Quest Browser)."
