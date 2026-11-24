#!/usr/bin/env bash
# Back up the Postgres database (and, with --storage, the local object store volume) of the running stack.
# Cron-ready (see infra/cron/music-world.cron): quiet on success, non-zero exit and a message on failure.
# Usage: infra/scripts/backup-db.sh [--storage]
# Env:   BACKUP_DIR (default infra/backups), BACKUP_KEEP (dumps kept, default 14).
# Restore: infra/README.md § Backups.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/infra/docker-compose.yml")
BACKUP_DIR="${BACKUP_DIR:-$ROOT/infra/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
umask 077
mkdir -p "$BACKUP_DIR"

# Custom-format dump (compressed, restorable table by table). Credentials stay inside the container.
dump="$BACKUP_DIR/music_world-$stamp.dump"
if ! "${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$dump.part"; then
  rm -f "$dump.part"
  echo "backup-db: pg_dump failed" >&2
  exit 1
fi
[[ -s "$dump.part" ]] || { rm -f "$dump.part"; echo "backup-db: empty dump" >&2; exit 1; }
mv "$dump.part" "$dump"

if [[ "${1:-}" == "--storage" ]]; then
  # Uploads and stems when no S3 bucket is configured (the 'storage' volume, read through the api container).
  archive="$BACKUP_DIR/storage-$stamp.tar.gz"
  if ! "${COMPOSE[@]}" exec -T api tar -czf - -C /data storage >"$archive.part"; then
    rm -f "$archive.part"
    echo "backup-db: storage archive failed" >&2
    exit 1
  fi
  mv "$archive.part" "$archive"
fi

# Retention: keep the newest $BACKUP_KEEP files of each kind.
for pattern in 'music_world-*.dump' 'storage-*.tar.gz'; do
  find "$BACKUP_DIR" -maxdepth 1 -name "$pattern" -printf '%f\n' | sort -r | tail -n +"$((BACKUP_KEEP + 1))" |
    while IFS= read -r old; do rm -f -- "$BACKUP_DIR/$old"; done
done
