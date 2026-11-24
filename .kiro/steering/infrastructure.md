---
inclusion: fileMatch
fileMatchPattern: ["infra/**", "**/Dockerfile*", "Makefile"]
---

# Infrastructure (OVHcloud, Docker Compose)

## Services (`infra/docker-compose.yml`)

| Service | Image | Port (internal) | Notes |
|---|---|---|---|
| `caddy` | caddy | 80, 443 (public) | Only public service; Let's Encrypt; `/api/*` → api, rest → web |
| `web` | `infra/docker/web.Dockerfile` (Next.js standalone) | 3000 | |
| `api` | `infra/docker/api.Dockerfile` | 8000 | uvicorn, 2 workers, `--forwarded-allow-ips '*'` (only Caddy reaches it: client IPs for the director rate limit) |
| `worker` | same image as api | — | `arq music_world.worker.WorkerSettings`; CPU-heavy (Demucs) |
| `postgres` | postgres:16 | 5432 | volume `pgdata` |
| `redis` | redis:7 | 6379 | |

## Rules

- Only Caddy publishes ports. Every other service is on the internal network; if a port must be published for
  debugging, bind it to `127.0.0.1`.
- Healthchecks on every service; `depends_on` with `condition: service_healthy`.
- Secrets come from `infra/.env` on the server (never committed); `infra/.env.example` lists every variable.
- Object storage: OVHcloud Object Storage (S3 API), configured by `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY`. Buckets are private; the API serves presigned URLs. While these are incomplete,
  api and worker share the `storage` volume at `STORAGE_DIR=/data/storage` (local object store, same keys).
- The api image includes ffmpeg/ffprobe (upload duration check, worker decode stage).
- The worker image pre-downloads Demucs and Basic Pitch weights at build time (no download at first job).
- Sign-in e-mails: `PUBLIC_BASE_URL` defaults to `https://$DOMAIN` in Compose; `AUTH_EMAIL_SENDER=smtp` with the
  `SMTP_*` settings sends real e-mails (outbound port 587 must be open); `console` only logs the link.
- Caddy blocks `/api/docs` in production unless `API_DOCS=true`.
- Caddy limits request bodies (26 MiB for `POST /api/projects`, 1 MiB elsewhere; the API checks the same) and sets
  HSTS, `nosniff`, `X-Frame-Options DENY`, `Permissions-Policy` and a Content-Security-Policy. When the web app
  needs a new external origin (CDN, S3 presigned URLs), add it to the CSP `connect-src`/`media-src`/`img-src` and
  re-run the CSP browser check (`docs/security-review.md`). Never publish the api port: uvicorn trusts
  `X-Forwarded-For` from any peer, and only Caddy rewrites it.
- The `api` container runs `alembic upgrade head` before uvicorn; `worker` waits for `api` to be healthy.
- Images build from the repository root (`.dockerignore` excludes node_modules, venvs, `.env`). The web image is
  Next.js standalone (`apps/web/server.js` inside the image because tracing root = repo root).
- Local stack: `make dev` (no `infra/.env` needed; defaults = development, `DOMAIN=localhost`, Caddy local CA, so
  use `curl -k https://localhost/api/health`).
- Uptime: `restart: unless-stopped`, healthchecks and log rotation (`x-logging`, 5 × 10 MB) on every service; the
  worker has a 60 s `stop_grace_period`. Server scripts in `infra/scripts/` (`backup-db.sh`, `check-disk.sh`,
  `check-health.sh`) run from `infra/cron/music-world.cron`; backups go to the git- and Docker-ignored
  `infra/backups/`. Restore steps: `infra/README.md` § Backups. Never `docker volume prune` on the server.
- Deployment is scripted in `infra/deploy.sh` and described in the `deploy-ovh` skill. The demo must stay online
  until 2027-01-29 (end of Kiroween judging).

## Makefile targets

`make help` lists them all. Run: `dev` (Docker, builds only changed images), `dev-infra` + `dev-api` + `dev-worker` +
`dev-web` (host, hot reload), `dev-local` (host, no Docker: API on SQLite + web, plus Redis and worker if `redis-server` exists), `up` / `down` / `ps` / `logs` / `shell`. Build: `build`, `rebuild`. Checks: `test`,
`check` (`make -j3 check` parallel), `lint`, `format`, `schemas`. Ops: `deploy`, `check-env`. Disk: `disk`, `prune`,
`prune-images`, `prune-cache`, `prune-all`, `prune-volumes` (destructive, `CONFIRM=yes`, refused on a production
`infra/.env`), `clean`, `clean-deps`. Nothing uses `docker ... prune -a`: other projects share this Docker daemon.

- Image builds go through `infra/scripts/build-changed.sh`: a content hash of the sources decides, the Docker layer
  cache does the rest. Keep Dockerfile layers ordered by change frequency (deps → weights → code).
- Root `docker-compose.yml` only `include`s `infra/docker-compose.yml` with `infra/.env`; edit the services in `infra/`.
- `infra/docker-compose.dev.yml` (`make dev`, `up`, `dev-infra`) publishes Postgres and Redis on 127.0.0.1 and runs Garage, the local S3 store (`garage-up` creates its bucket and key; containers reach it at `http://garage:3900`); never used in production, which uses Cloudflare R2.
- Env example files: `infra/.env.example` (global: Docker stack + production), `apps/api/.env.example` (host API and
  worker, loaded by `uv run --env-file`), `apps/web/.env.example` (Next dev, copy to `.env.local`).
