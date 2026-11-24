#!/usr/bin/env bash
# Uptime probe (cron-ready): silent when the public API answers and every container is healthy, else prints and
# exits 1. Usage: infra/scripts/check-health.sh [https://domain]   (default https://$DOMAIN from infra/.env)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
url="${1:-}"
if [[ -z "$url" ]]; then
  domain="$(grep -E '^DOMAIN=' "$ROOT/infra/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d "\"' ")"
  url="https://${domain:-localhost}"
fi
status=0

if ! body="$(curl -fsS --max-time 10 "$url/api/ready")"; then
  echo "check-health: $url/api/ready failed: ${body:-no response}"
  status=1
fi
unhealthy="$(docker compose -f "$ROOT/infra/docker-compose.yml" ps -a --format '{{.Service}} {{.Status}}' 2>/dev/null |
  grep -vE '\(healthy\)' || true)"
if [[ -n "$unhealthy" ]]; then
  echo "check-health: containers not healthy:"
  echo "$unhealthy"
  status=1
fi
exit "$status"
