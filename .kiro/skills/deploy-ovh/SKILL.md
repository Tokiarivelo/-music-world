---
name: deploy-ovh
description: Deploy Music World to the OVHcloud instance with Docker Compose and Caddy HTTPS, run migrations, verify health, the demo song and VR on Quest, and roll back if needed. Use when the user asks to deploy, release, or update the public demo URL.
---

# Deploy to OVHcloud

Rules: `infrastructure.md`. Deploying is outward-facing: **ask the user before running it**.

First deploy on a new instance (server, DNS, Docker, clone, `infra/.env`, cron): `infra/README.md` § Deploy.

## Before

1. `make check` passes locally (lint, types, tests, architecture check); the commit is pushed.
2. On the server, `infra/scripts/check-env.sh` prints `0 error(s)` (names only, never values; `deploy.sh` runs it
   too and stops on errors).
3. `DRY_RUN=1 DEPLOY_HOST=<user@host> make deploy` shows the commit and the server steps.

## Deploy

4. `DEPLOY_HOST=<user@host> DEPLOY_DOMAIN=<domain> [DEPLOY_REF=<sha>] make deploy` (runs `infra/deploy.sh`: ssh →
   checkout the pushed commit → check-env, disk → `docker compose build --pull` → `up -d`; the api runs
   `alembic upgrade head` before uvicorn → waits until every service is `healthy` → public `/api/ready`). It prints
   the previous commit for rollback.
5. On failure it prints the unhealthy services, the last api/worker logs and the rollback command.

## Verify

6. `curl -fsS https://<domain>/api/health` → status ok, postgres/redis/storage ok.
7. Open `https://<domain>/play/demo`: the pre-analysed demo song plays with the default look.
8. Upload a short royalty-free clip: analysis completes; director answers with the selected provider or falls back.
9. Quest Browser: Enter VR works on the public URL (valid Let's Encrypt certificate).

## Rollback

10. If any check fails: redeploy the previous commit (`DEPLOY_REF=<sha> make deploy`); migrations must be backward
    compatible for one version (never drop a column in the same release that stops using it).

Record the deployed commit, date and checks in `docs/handoff.md` (section 1).
