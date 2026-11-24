---
inclusion: fileMatch
fileMatchPattern: ["apps/api/music_world/shared/settings.py", "**/.env.example", "infra/**", "apps/web/next.config.ts"]
---

# Environment variables (core, accounts)

Moved out of `tech.md` (always loaded) to save tokens. The Bedrock and Muse variables stay in `tech.md`, next to the
provider rules. Source of truth in code: `apps/api/music_world/shared/settings.py`. Example files:
`infra/.env.example` (Docker stack and production, global), `apps/api/.env.example` (API and worker on the host),
`apps/web/.env.example` (Next dev server). A new variable goes in all of them that apply, in `docker-compose.yml`
(`x-api-env`) and in `infra/scripts/check-env.sh` when it is required in production.

## Core environment variables (`music_world.shared.settings`)

| Env var | Default | Use |
|---|---|---|
| `APP_ENV` | `development` | `development` enables `/api/docs` and `POST /api/jobs/demo`; `production` disables both |
| `APP_VERSION` | package version | Reported by `/api/health` |
| `LOG_LEVEL` | `INFO` | structlog JSON level |
| `API_DOCS` | `false` | Force `/api/docs` on outside development |
| `DATABASE_URL` | `postgresql+asyncpg://music_world:music_world@localhost:5432/music_world` | Postgres (asyncpg driver) |
| `REDIS_URL` | `redis://localhost:6379/0` | arq queue |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | — | S3-compatible storage: Garage locally (`make garage-init`), Cloudflare R2 deployed (`S3_REGION=auto`); health reports `not_configured` while unset |
| `LYRICS_LOOKUP`, `LYRICS_ASR`, `LYRICS_ASR_MODEL`, `LYRICS_LANGUAGE` | `true`, `true`, `base`, detect | Lyrics without a user `.lrc`: online lookup (LRCLIB, artist + title + duration only), then local Whisper on the vocal stem; `tiny` is fastest, `small` most accurate |
| `STORAGE_DIR` | `.data/storage` | Local object store (uploads, stems, stage checkpoints) used while the `S3_*` settings are incomplete |
| `ANALYSIS_MIN_VELOCITY` | `0.25` | Notes below this velocity (0–1) are dropped (requirement 3.3) |
| `DEMUCS_MODEL` | `htdemucs` | Demucs pretrained model name used by the worker |
| `LYRICS_PROVIDER` | `muse` | `muse` (Muse Voice on the vocal stem, skipped without `META_API_KEY`), `lrc` (user file only), `none` |
| `DEV_API_URL` | `http://localhost:8000` | Web dev server only (`pnpm dev` without Caddy): where `/api/*` is proxied |
| `DOMAIN` | `localhost` | Compose/Caddy only: public domain (Let's Encrypt), `localhost` = Caddy local CA |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `music_world` | Compose only: postgres credentials, used to build `DATABASE_URL` |

## Accounts and template store env (`06-template-store`)

| Env var | Default | Use |
|---|---|---|
| `PUBLIC_BASE_URL` | `http://localhost:3000` (Compose: `https://$DOMAIN`) | Web origin: sign-in links, production `Origin` check on `/api/auth/*` |
| `AUTH_EMAIL_SENDER` | `console` | `console` (link logged by the api, development) or `smtp` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS` | —, `587`, —, —, —, `true` | SMTP sender (password server only, 10 s timeout, one retry) |
| `AUTH_TOKEN_TTL_MIN` | `15` | Sign-in link lifetime (single use, stored hashed) |
| `SESSION_TTL_DAYS` | `30` | Session cookie lifetime (`mw_session`, httpOnly, SameSite=Lax) |
| `SESSION_COOKIE_SECURE` | `true` | `Secure` attribute of `mw_session` / `mw_csrf` |
| `AUTH_RATE_LIMIT_PER_HOUR` | `10` | Sign-in links per client IP (plus 5 per address) |
| `TEMPLATE_PUBLISH_RATE_LIMIT_PER_HOUR` | `10` | Store templates created per user |
| `TEMPLATE_REPORT_HIDE_THRESHOLD` | `3` | Distinct reports that hide a store template |
| `MODERATOR_EMAILS` | empty | Comma-separated e-mails (case-insensitive) that may use `/moderation`; empty disables the feature (404). Kept hashed in memory, never logged |
| `UPLOAD_RATE_LIMIT_PER_HOUR` | `20` | Song uploads per user or client IP |

