---
name: deploy-ovh
description: Deploy Music World to the OVHcloud instance with Docker Compose and Caddy HTTPS, run migrations, verify health, the demo song and VR on Quest, and roll back if needed. Use when the user asks to deploy, release, or update the public demo URL.
---

# Deploy to OVHcloud

Rules: `infrastructure.md`. Deploying is outward-facing: **ask the user before running it**.

## Before

1. `make check` passes locally (lint, types, tests, architecture check).
2. `infra/.env` on the server contains every variable of `infra/.env.example` (compare names only, never print values).
3. Note the currently deployed commit for rollback (`ssh <host> 'cd music-world && git rev-parse HEAD'`).

## Deploy

4. `make deploy` (runs `infra/deploy.sh`: sync code → `docker compose build` → `alembic upgrade head` in the api
   container → `docker compose up -d`).
5. Wait for healthchecks: `docker compose ps` shows every service `healthy`.

## Verify

6. `curl -fsS https://<domain>/api/health` → status ok, postgres/redis/storage ok.
7. Open `https://<domain>/play/demo`: the pre-analysed demo song plays with the default look.
8. Upload a short royalty-free clip: analysis completes; director answers with the selected provider or falls back.
9. Quest Browser: Enter VR works on the public URL (valid Let's Encrypt certificate).

## Rollback

10. If any check fails: redeploy the previous commit (`DEPLOY_REF=<sha> make deploy`); migrations must be backward
    compatible for one version (never drop a column in the same release that stops using it).

Record the deployed commit, date and checks in `docs/handoff.md` (section 1).
