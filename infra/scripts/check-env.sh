#!/usr/bin/env bash
# Validate a production env file before a deploy: fails fast on missing or unsafe settings.
# Usage: infra/scripts/check-env.sh [path/to/.env]   (default: infra/.env)
# Never prints values, only variable names. The file is parsed, never sourced (no code runs from it).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${1:-$ROOT/infra/.env}"
EXAMPLE="$ROOT/infra/.env.example"
errors=0
warnings=0

error() { echo "✗ $*"; errors=$((errors + 1)); }
warn() { echo "! $*"; warnings=$((warnings + 1)); }

[[ -f "$ENV_FILE" ]] || { echo "✗ $ENV_FILE not found (copy infra/.env.example to infra/.env and fill it)"; exit 1; }

declare -A env=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
  [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
  key="${BASH_REMATCH[2]}" value="${BASH_REMATCH[3]}"
  value="${value%%[[:space:]]#*}"                       # trailing comment
  value="${value#"${value%%[![:space:]]*}"}"            # leading spaces
  value="${value%"${value##*[![:space:]]}"}"            # trailing spaces
  [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]] && value="${BASH_REMATCH[1]}"
  env[$key]="$value"
done <"$ENV_FILE"

get() { echo "${env[$1]:-}"; }
has() { [[ -n "${env[$1]:-}" ]]; }

# 1. Every variable of .env.example is present (names only; empty is allowed where optional).
while IFS= read -r name; do
  [[ -v "env[$name]" ]] || error "$name missing (listed in infra/.env.example)"
done < <(grep -oE '^[A-Z_][A-Z0-9_]*=' "$EXAMPLE" | tr -d '=')

# 2. Production basics.
[[ "$(get APP_ENV)" == "production" ]] || error "APP_ENV must be production"
domain="$(get DOMAIN)"
if [[ -z "$domain" || "$domain" == "localhost" ]]; then
  error "DOMAIN must be the public domain (Let's Encrypt needs a real DNS name)"
fi
base="$(get PUBLIC_BASE_URL)"
if [[ -n "$base" && "$base" != https://* ]]; then error "PUBLIC_BASE_URL must start with https://"; fi
[[ "$(get SESSION_COOKIE_SECURE)" == "false" ]] && error "SESSION_COOKIE_SECURE must not be false in production"
[[ "$(get API_DOCS)" == "true" ]] && warn "API_DOCS=true exposes /api/docs publicly"

# 3. Secrets.
pg="$(get POSTGRES_PASSWORD)"
case "$pg" in
  "" | change-me | music_world | postgres | password) error "POSTGRES_PASSWORD is empty or a default value" ;;
  *) ((${#pg} >= 16)) || error "POSTGRES_PASSWORD must be at least 16 characters (openssl rand -hex 24)" ;;
esac

# 4. Object storage: all or nothing.
s3_set=0
for k in S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY; do has "$k" && s3_set=$((s3_set + 1)); done
if ((s3_set > 0 && s3_set < 5)); then
  error "S3_* settings are incomplete: set all five (or none to use the local storage volume)"
elif ((s3_set == 0)); then
  warn "no S3 bucket: uploads and stems stay in the 'storage' Docker volume (back it up)"
fi

# 5. Sign-in e-mails.
case "$(get AUTH_EMAIL_SENDER)" in
  smtp)
    for k in SMTP_HOST SMTP_FROM; do has "$k" || error "AUTH_EMAIL_SENDER=smtp needs $k"; done
    has SMTP_USERNAME && ! has SMTP_PASSWORD && error "SMTP_USERNAME is set without SMTP_PASSWORD"
    ;;
  console | "") warn "AUTH_EMAIL_SENDER=console writes sign-in links to the api logs (use smtp in production)" ;;
  *) error "AUTH_EMAIL_SENDER must be console or smtp" ;;
esac

# 6. AI World Director (missing keys only degrade to the mock director).
for k in META_DIRECTOR_MODEL META_SHAPE_MODEL; do
  [[ "$(get "$k")" == *contributor* ]] && warn "$k is a *-contributor model: Meta may train on the song summary and lyrics (the upload page says so)"
done
case "$(get LLM_PROVIDER)" in
  muse) has META_API_KEY || warn "LLM_PROVIDER=muse without META_API_KEY: the mock director answers" ;;
  bedrock)
    has AWS_REGION || warn "LLM_PROVIDER=bedrock without AWS_REGION: the mock director answers"
    { has AWS_ACCESS_KEY_ID && has AWS_SECRET_ACCESS_KEY; } || has AWS_BEARER_TOKEN_BEDROCK ||
      warn "LLM_PROVIDER=bedrock without AWS credentials: the mock director answers"
    ;;
  mock) ;;
  *) error "LLM_PROVIDER must be muse, bedrock or mock" ;;
esac
if { has AWS_ACCESS_KEY_ID && ! has AWS_SECRET_ACCESS_KEY; } || { ! has AWS_ACCESS_KEY_ID && has AWS_SECRET_ACCESS_KEY; }; then
  error "set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or neither)"
fi

echo "check-env: $errors error(s), $warnings warning(s) in $ENV_FILE"
((errors == 0))
