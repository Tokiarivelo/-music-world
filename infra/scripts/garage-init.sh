#!/usr/bin/env bash
# One-time setup of the local Garage node (make dev-infra, then make garage-init): single-node layout, the bucket and an
# S3 key. Idempotent. Prints the S3_* lines to put in apps/api/.env. Development only; production uses Cloudflare R2.
set -euo pipefail

BUCKET="${S3_BUCKET:-music-world}"
KEY_NAME="${S3_KEY_NAME:-music-world-dev}"
COMPOSE=(docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml)
garage() { "${COMPOSE[@]}" exec -T garage /garage "$@"; }

for _ in $(seq 1 30); do garage status >/dev/null 2>&1 && break; sleep 1; done
garage status >/dev/null

if garage layout show 2>/dev/null | grep -q "No nodes"; then
  node="$(garage node id -q | cut -d@ -f1)"
  garage layout assign -z dev -c 50G "$node"
  garage layout apply --version 1
fi
garage bucket info "$BUCKET" >/dev/null 2>&1 || garage bucket create "$BUCKET"
if ! garage key info "$KEY_NAME" >/dev/null 2>&1; then
  garage key create "$KEY_NAME" >/dev/null
fi
garage bucket allow --read --write --owner "$BUCKET" --key "$KEY_NAME" >/dev/null

info="$(garage key info "$KEY_NAME" --show-secret)"
echo "# Garage is ready. Add to apps/api/.env:"
echo "S3_ENDPOINT=http://127.0.0.1:3900"
echo "S3_REGION=garage"
echo "S3_BUCKET=$BUCKET"
echo "S3_ACCESS_KEY=$(echo "$info" | awk '/Key ID/ {print $3}')"
echo "S3_SECRET_KEY=$(echo "$info" | awk '/Secret key/ {print $3}')"
