# infra

Docker Compose stack, Dockerfiles, Caddyfile, `.env.example` and the server scripts for OVHcloud.
Rules in `.kiro/steering/infrastructure.md`; deployment steps in the `deploy-ovh` skill.

| Path | Purpose |
|---|---|
| `docker-compose.yml` | caddy, web, api, worker, postgres, redis; restart policies, healthchecks, log rotation |
| `Caddyfile` | HTTPS, `/api/*` → api, rest → web, body limits, security headers and CSP |
| `docker/` | `api.Dockerfile` (api + worker, ffmpeg, Demucs weights pre-downloaded), `web.Dockerfile` |
| `.env.example` | every variable; copy to `infra/.env` on the server (never committed) |
| `scripts/check-env.sh` | fails fast on missing or unsafe production settings (names only, never values) |
| `scripts/backup-db.sh` | Postgres dump (+ `--storage`: local object store volume), retention `BACKUP_KEEP` |
| `scripts/check-disk.sh` | disk alert (default 85 %) with the safe clean-up order |
| `scripts/check-health.sh` | public `/api/ready` and container health probe |
| `cron/music-world.cron` | nightly backup, disk check every 30 min, health every 5 min |

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
