#!/usr/bin/env bash
# ==============================================================================
# scripts/agents/validate-architecture.sh
#
# Enforces Music World architecture rules (see .kiro/steering/architecture.md,
# frontend.md, tech.md). Safe to run when apps/ does not exist yet.
#
# Backend (apps/api/music_world/<context>/):
#   - domain/          imports no application/infrastructure/interfaces and no framework/SDK
#   - application/     imports no infrastructure/interfaces and no FastAPI/SQLAlchemy/SDK
#   - infrastructure/  imports no interfaces
#   - no context imports another context's infrastructure/ or interfaces/
# Web (apps/web/src/):
#   - engine/          no three, react, next, @iwsdk, DOM globals, timers, Math.random
#   - engine/, xr/     no setTimeout/setInterval (audio clock is the only time source)
#   - features/        cross-feature imports only through the barrel (@/features/<name>)
#   - no React Three Fiber / Drei anywhere
# Secrets:
#   - no LLM/AWS secret names referenced in apps/web; no NEXT_PUBLIC_*KEY|SECRET|TOKEN
#
# Exit codes: 0 = ok, 1 = violations found.
# ==============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 1

API="apps/api/music_world"
WEB="apps/web/src"
violations=0

report() { # $1 rule, $2 grep output
  if [[ -n "$2" ]]; then
    echo "✗ $1"
    echo "$2" | sed 's/^/    /'
    violations=$((violations + 1))
  fi
}

search() { # $1 regex, rest: paths (missing paths are ignored)
  local re="$1"; shift
  local existing=()
  for p in "$@"; do [[ -e "$p" ]] && existing+=("$p"); done
  [[ ${#existing[@]} -eq 0 ]] && return 0
  grep -rnE --include='*.py' --include='*.ts' --include='*.tsx' "$re" "${existing[@]}" 2>/dev/null \
    | grep -vE '/(__tests__|tests)/|\.test\.tsx?:' || true
}

echo "[agents] Validating Music World architecture…"

# ── Backend ───────────────────────────────────────────────────────────────────
if [[ -d "$API" ]]; then
  SDKS='fastapi|starlette|sqlalchemy|alembic|boto3|botocore|httpx|requests|openai|anthropic|librosa|demucs|basic_pitch|torch|arq|redis|pydantic'
  for ctx_dir in "$API"/*/; do
    ctx="$(basename "$ctx_dir")"
    [[ "$ctx" =~ ^(schemas|shared|__pycache__)$ ]] && continue

    report "$ctx/domain imports an outer layer" \
      "$(search "^\s*(from|import)\s+music_world\.$ctx\.(application|infrastructure|interfaces)" "$ctx_dir/domain")"
    report "$ctx/domain imports a framework or SDK" \
      "$(search "^\s*(from|import)\s+($SDKS)\b" "$ctx_dir/domain")"
    report "$ctx/application imports infrastructure or interfaces" \
      "$(search "^\s*(from|import)\s+music_world\.[a-z_]+\.(infrastructure|interfaces)" "$ctx_dir/application")"
    report "$ctx/application imports a framework or SDK (pydantic allowed in dto.py only)" \
      "$(search "^\s*(from|import)\s+(fastapi|starlette|sqlalchemy|alembic|boto3|botocore|httpx|requests|openai|anthropic|librosa|demucs|basic_pitch|torch|arq|redis)\b" "$ctx_dir/application")"
    report "$ctx/infrastructure imports interfaces" \
      "$(search "^\s*(from|import)\s+music_world\.[a-z_]+\.interfaces" "$ctx_dir/infrastructure")"
    report "$ctx imports another context's infrastructure/interfaces" \
      "$(search "^\s*(from|import)\s+music_world\.[a-z_]+\.(infrastructure|interfaces)" "$ctx_dir" \
          | grep -vE "music_world\.$ctx\." || true)"
  done
fi

# ── Web ───────────────────────────────────────────────────────────────────────
if [[ -d "$WEB" ]]; then
  report "engine/ imports a framework (must stay pure)" \
    "$(search "from ['\"](three|react|react-dom|next|@iwsdk/[a-z-]+|iwer)['\"/]" "$WEB/engine")"
  report "engine/ uses DOM globals or Math.random" \
    "$(search "\b(window|document|navigator|localStorage)\.|Math\.random\(" "$WEB/engine")"
  report "engine/ or xr/ uses timers for sync (use AudioClock.now())" \
    "$(search "\b(setTimeout|setInterval)\(" "$WEB/engine" "$WEB/xr")"
  report "React Three Fiber / Drei is not allowed (IWSDK owns the renderer)" \
    "$(search "from ['\"]@react-three/" "$WEB")"
  if [[ -d "$WEB/features" ]]; then
    for f_dir in "$WEB"/features/*/; do
      feat="$(basename "$f_dir")"
      report "feature '$feat' deep-imports another feature (use its index.ts barrel)" \
        "$(search "from ['\"]@/features/[a-z0-9-]+/" "$f_dir" | grep -vE "@/features/$feat/" || true)"
    done
    report "app/ deep-imports a feature (pages compose barrels only)" \
      "$(search "from ['\"]@/features/[a-z0-9-]+/" "$WEB/app")"
  fi
fi

# ── Secrets ───────────────────────────────────────────────────────────────────
if [[ -d "apps/web" ]]; then
  report "web app references a server-only secret" \
    "$(search "\b(META_API_KEY|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|S3_SECRET_KEY|DATABASE_URL)\b" apps/web/src)"
  report "secret-looking NEXT_PUBLIC_ variable" \
    "$(search "NEXT_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)" apps/web)"
fi

echo ""
if [[ $violations -gt 0 ]]; then
  echo "[agents] $violations rule(s) violated. See .kiro/steering/architecture.md and frontend.md."
  exit 1
fi
echo "[agents] ✓ Architecture rules respected."
exit 0
