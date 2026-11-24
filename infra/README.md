# infra

Docker Compose stack, Dockerfiles, Caddyfile, `.env.example` and the server scripts for OVHcloud.
Rules in `.kiro/steering/infrastructure.md`; deployment steps in the `deploy-ovh` skill.

| Path | Purpose |
|---|---|
| `docker-compose.yml` | caddy, web, api, worker, postgres, redis; restart policies, healthchecks, log rotation |
| `Caddyfile` | HTTPS, `/api/*` → api, rest → web, body limits, security headers and CSP |
| `docker/` | `api.Dockerfile` (api + worker, ffmpeg, Demucs weights pre-downloaded), `web.Dockerfile` |
| `.env.example` | every variable; copy to `infra/.env` on the server (never committed). Host-run API and web have their own: `apps/api/.env.example`, `apps/web/.env.example` |
| `docker-compose.dev.yml` | `make dev-infra` only: publishes Postgres and Redis on 127.0.0.1 for the host-run API and worker |
| `scripts/build-changed.sh` | builds an image only when its sources changed (content hash in `.data/build/`); used by `make dev`, `up`, `build` |
| `deploy.sh` | `make deploy`: ssh to the server, checkout a pushed commit, check env and disk, build, up, wait healthy |
| `scripts/check-env.sh` | fails fast on missing or unsafe production settings (names only, never values) |
| `scripts/backup-db.sh` | Postgres dump (+ `--storage`: local object store volume), retention `BACKUP_KEEP` |
| `scripts/check-disk.sh` | disk alert (default 85 %) with the safe clean-up order |
| `scripts/check-health.sh` | public `/api/ready` and container health probe |
| `scripts/smoke-dev.sh` | `make smoke`: health, readiness, home, demo page and demo-song cache header on the running local stack |
| `cron/music-world.cron` | nightly backup, disk check every 30 min, health every 5 min |

## Deploy (runbook)

Nothing below has run yet: it needs the OVHcloud instance, a domain and the keys (roadmap 8.1–8.3, human).

**First deploy (once)**

1. OVHcloud Public Cloud instance (Ubuntu 24.04, ≥ 4 vCPU / 8 GB RAM for Demucs, ≥ 40 GB disk), SSH key access.
   Security group / firewall: inbound 22, 80, 443 (TCP) and 443 (UDP, HTTP/3); outbound 443 (LLM APIs, S3) and 587
   (SMTP).
2. DNS: an A (and AAAA if IPv6) record `DOMAIN → instance IP`. Wait until `dig +short <domain>` answers.
3. Optional bucket: OVHcloud Object Storage (S3 API), private, with an S3 user → the five `S3_*` values. Without it
   uploads stay in the `storage` volume (back it up with `--storage`).
4. On the server: install Docker Engine + Compose plugin (`curl -fsSL https://get.docker.com | sh`), add the user to
   the `docker` group, `sudo systemctl enable docker`, then
   `git clone https://github.com/Tokiarivelo/-music-world.git ~/music-world`.
5. `cp infra/.env.example infra/.env` on the server and fill it: `DOMAIN`, `APP_ENV=production`,
   `POSTGRES_PASSWORD=$(openssl rand -hex 24)`, `AUTH_EMAIL_SENDER=smtp` + `SMTP_*`, `META_API_KEY` and/or the AWS
   values, `S3_*` if any. `chmod 600 infra/.env`. Then `infra/scripts/check-env.sh` must print `0 error(s)`.
6. From your machine: `DEPLOY_HOST=ubuntu@<ip> DEPLOY_DOMAIN=<domain> make deploy` (try `DRY_RUN=1` first). The
   first build downloads images, Python wheels (torch CPU) and the Demucs weights: allow ~15 minutes.
7. Verify (skill `deploy-ovh` § Verify): `/api/health`, `/play/demo`, an upload, the director, `/templates`, sign-in
   e-mail, and **Enter VR** on the Quest Browser (8.3). Check the browser console for CSP reports.
8. Cron: edit `MW`/`MAILTO` in `infra/cron/music-world.cron`, then `crontab infra/cron/music-world.cron`.
   Run `infra/scripts/backup-db.sh --storage` once by hand.

**Later deploys:** push to `main`, then `DEPLOY_HOST=… DEPLOY_DOMAIN=… make deploy`. The script refuses unpushed
commits, stops on `check-env` errors and prints the rollback command (`DEPLOY_REF=<previous sha> make deploy`; the
previous sha is also in `~/music-world/.deploy-previous`). Prune old images afterwards: `docker image prune -f`.

**Demo song in production (8.2):** the demo analysis ships with the web bundle (`/play/demo` needs no worker). If
the demo MP3 changes, follow `docs/handoff.md` (re-analyse, replace the JSON and `DEMO_AUDIO_HASH`) before deploying.

## Local pitfall: "password authentication failed for user music_world"

`POSTGRES_PASSWORD` only applies when the `pgdata` volume is created. If `infra/.env` changed after the first
`make dev`, the api cannot log in. Without losing data: `make db-password` (sets the role's password to the current
value, then recreates api and worker). Production: never change the password this way without a backup first.

## Uptime (until 2027-01-29)

- Every service has `restart: unless-stopped` and a healthcheck; `depends_on` waits for healthy dependencies.
  Docker itself must start at boot: `sudo systemctl enable docker`.
- Container logs rotate at 5 × 10 MB per container (`x-logging` in Compose).
- The worker gets 60 s to stop (`stop_grace_period`); an interrupted analysis resumes from its last finished stage.
- Cron: `crontab infra/cron/music-world.cron` after setting `MW` (checkout path) and `MAILTO` in the file.
  Every script is silent on success and prints a reason with a non-zero exit on failure.
- Disk: alert at 85 %. Free space with `docker image prune -f` and `docker builder prune -f` (after a deploy), never
  `docker volume prune` (it deletes `pgdata`, `storage` and the Let's Encrypt certificates in `caddy_data`).

## Backups

Nightly (cron) or by hand from the repository root on the server:

```bash
infra/scripts/backup-db.sh            # infra/backups/music_world-<UTC>.dump (pg_dump custom format)
infra/scripts/backup-db.sh --storage  # also infra/backups/storage-<UTC>.tar.gz (uploads, stems, director cache)
```

`infra/backups/` is git-ignored and Docker-ignored, mode 700 files. Copy the newest dump off the server from time to
time (`scp`); with an S3 bucket configured, objects live in the bucket and only the dump matters.

### Restore

```bash
docker compose -f infra/docker-compose.yml stop api worker          # no writes during the restore
docker compose -f infra/docker-compose.yml exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
  < infra/backups/music_world-<UTC>.dump
# Local object store (only if it was lost): unpack into the storage volume through a one-off api container.
docker compose -f infra/docker-compose.yml run --rm --no-deps -T api tar -xzf - -C /data \
  < infra/backups/storage-<UTC>.tar.gz
docker compose -f infra/docker-compose.yml start api worker         # api runs `alembic upgrade head` first
curl -fsS https://$DOMAIN/api/ready
```

A dump restores into the same or a newer schema version (`alembic upgrade head` runs at api start); never restore
into an older release.
