#!/usr/bin/env bash
# Disk space check for the server (cron-ready): silent while every watched filesystem is below the threshold,
# otherwise prints usage and the biggest Docker consumers and exits 1 (cron mails the output).
# Usage: infra/scripts/check-disk.sh [threshold-percent]   (default 85)
# Env:   CHECK_PATHS (default "/ /var/lib/docker"), DISK_THRESHOLD (same as the argument).
set -euo pipefail

THRESHOLD="${1:-${DISK_THRESHOLD:-85}}"
read -r -a paths <<<"${CHECK_PATHS:-/ /var/lib/docker}"
full=0

for path in "${paths[@]}"; do
  [[ -e "$path" ]] || continue
  used="$(df -P "$path" | awk 'NR == 2 { gsub("%", "", $5); print $5 }')"
  if ((used >= THRESHOLD)); then
    echo "check-disk: $path is ${used}% full (threshold ${THRESHOLD}%)"
    full=1
  fi
done

if ((full)); then
  df -h "${paths[@]}" 2>/dev/null || true
  if command -v docker >/dev/null; then
    docker system df 2>/dev/null || true
  fi
  cat <<'EOF'
Free space (safe order): docker image prune -f · docker builder prune -f ·
older dumps in infra/backups (BACKUP_KEEP) · never `docker volume prune` (pgdata, storage, caddy_data).
EOF
  exit 1
fi
