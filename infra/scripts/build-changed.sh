#!/usr/bin/env bash
# Build a Compose service image only when its inputs changed (or the image is missing).
# Usage: infra/scripts/build-changed.sh <service> [--force]      (service: api | web)
# The inputs are hashed (content, not mtime: tracked + untracked, git-ignored files excluded) and the hash of the
# last successful build is kept in .data/build/<service>.hash. Docker's layer cache still applies when it builds.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

service="${1:-}"
force="${2:-}"
case "$service" in
  api) image="music-world-api"; inputs=(apps/api infra/docker/api.Dockerfile .dockerignore) ;;
  web) image="music-world-web"; inputs=(apps/web packages/schemas package.json pnpm-workspace.yaml pnpm-lock.yaml
                                         infra/docker/web.Dockerfile .dockerignore) ;;
  *) echo "usage: $0 api|web [--force]" >&2; exit 2 ;;
esac

# Files the Docker context copies: tests and caches do not change the image (see .dockerignore).
hash="$(git ls-files -co --exclude-standard -z -- "${inputs[@]}" ':!apps/api/tests' ':!**/*.md' \
  | xargs -0 -r sha256sum 2>/dev/null | sha256sum | cut -d' ' -f1)"
stamp=".data/build/$service.hash"
mkdir -p .data/build

if [[ "$force" != "--force" && -f "$stamp" && "$(cat "$stamp")" == "$hash" ]] \
  && docker image inspect "$image" >/dev/null 2>&1; then
  echo "[build] $service: unchanged, image $image reused"
  exit 0
fi

echo "[build] $service: building ($([[ "$force" == "--force" ]] && echo forced || echo changed))"
DOCKER_BUILDKIT=1 docker compose -f infra/docker-compose.yml build "$service"
echo "$hash" >"$stamp"
