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
| `api` | `infra/docker/api.Dockerfile` | 8000 | uvicorn, 2 workers |
| `worker` | same image as api | — | `arq music_world.worker.WorkerSettings`; CPU-heavy (Demucs) |
| `postgres` | postgres:16 | 5432 | volume `pgdata` |
| `redis` | redis:7 | 6379 | |

## Rules

- Only Caddy publishes ports. Every other service is on the internal network; if a port must be published for
  debugging, bind it to `127.0.0.1`.
- Healthchecks on every service; `depends_on` with `condition: service_healthy`.
- Secrets come from `infra/.env` on the server (never committed); `infra/.env.example` lists every variable.
- Object storage: OVHcloud Object Storage (S3 API), configured by `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY`. Buckets are private; the API serves presigned URLs.
- The worker image pre-downloads Demucs and Basic Pitch weights at build time (no download at first job).
- Caddy blocks `/api/docs` in production unless `API_DOCS=true`.
- Deployment is scripted in `infra/deploy.sh` and described in the `deploy-ovh` skill. The demo must stay online
  until 2027-01-29 (end of Kiroween judging).

## Makefile targets (created by spec 01)

`make dev` · `make test` · `make check` · `make schemas` · `make build` · `make deploy` · `make logs`
