#!/usr/bin/env bash
# Smoke test of the local Docker stack (make dev / make up): health, readiness, demo page, demo audio headers.
# Usage: infra/scripts/smoke-dev.sh [--up]    --up starts the stack first (builds only changed images).
# Never stops the stack. Talks to https://localhost with Caddy's local certificate (curl -k).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE="${SMOKE_BASE_URL:-https://localhost}"
failures=0

[[ "${1:-}" == "--up" ]] && make -C "$ROOT" up

check() { # name, expected status, url [, grep pattern for headers]
  local name="$1" want="$2" url="$3" pattern="${4:-}" code headers
  headers="$(curl -ks -D - -o /dev/null --max-time 10 "$url" || true)"
  code="$(awk 'NR==1 {print $2}' <<<"$headers")"
  if [[ "$code" != "$want" ]]; then echo "✗ $name: HTTP ${code:-none}, expected $want ($url)"; failures=$((failures + 1)); return; fi
  if [[ -n "$pattern" ]] && ! grep -qiE "$pattern" <<<"$headers"; then
    echo "✗ $name: header /$pattern/ missing"; failures=$((failures + 1)); return
  fi
  echo "✓ $name"
}

check "api health" 200 "$BASE/api/health"
check "api ready" 200 "$BASE/api/ready"
check "home page" 200 "$BASE/"
check "demo world page" 200 "$BASE/play/demo"
check "demo song cached" 200 "$BASE/demo/neon-nocturne.mp3" "cache-control: public, max-age=86400"
check "security headers" 200 "$BASE/api/health" "strict-transport-security"

if [[ "$failures" -gt 0 ]]; then echo "smoke: $failures failure(s)"; exit 1; fi
echo "smoke: ok"
