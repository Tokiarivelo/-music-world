# Security review (roadmap 8.4)

**Date:** 2026-11-24 · **Scope:** whole application at the start of Phase 8 (`apps/api`, `apps/web`, `infra/`).
**Method:** `review-change` skill checklist and `.kiro/agents/reviewer.md` over every API route, the auth and session
code, uploads, the template store, the director, logging, the Compose stack and the Caddyfile;
`bash scripts/agents/validate-architecture.sh`; a browser check of the Content-Security-Policy (below).

**Verdict:** no high finding. The two medium findings are fixed with tests; low findings are recorded with the
reason they are accepted for the MVP.

## Findings

| # | Severity | Area | Problem | Status |
|---|---|---|---|---|
| 1 | Medium | Uploads (`/api/projects`, every body) | Starlette spools multipart file parts to disk **before** the route runs, so the 25 MB check in the route came after the whole body was written: one large or endless (chunked) request could fill the server disk. JSON bodies had no limit either. | **Fixed:** `shared/body_limit.py` refuses a declared `Content-Length` over the limit at once and stops a streamed body as soon as it goes over (`413 REQUEST_TOO_LARGE`): 26 MiB + 64 KiB + 1 MiB for `POST /api/projects`, 1 MiB elsewhere. Caddy applies the same limits (`request_body`). Tests: `tests/integration/test_body_limit.py`. |
| 2 | Medium | Caddy headers | No Content-Security-Policy, no clickjacking protection, no Permissions-Policy. | **Fixed:** CSP (`default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, connect-src limited to self + the jsDelivr/unpkg CDNs IWSDK uses for controller profiles and decoders), `X-Frame-Options DENY`, `Permissions-Policy` (camera, microphone, geolocation, payment, usb off; WebXR left allowed). Next.js `X-Powered-By` removed. |
| 3 | Low → fixed | Production settings | An `infra/.env` without `APP_ENV=production`, with `SESSION_COOKIE_SECURE=false`, an `http://` `PUBLIC_BASE_URL` or the default Postgres password would deploy silently. | **Fixed:** the API refuses to start in production with insecure cookie or base URL settings (`Settings.production_errors`, tested); `infra/scripts/check-env.sh` fails the deploy on a missing `APP_ENV=production`, default or short secrets and incomplete provider settings. |
| 4 | Low | Rate limits | In memory per uvicorn worker (2 workers → limits up to 2×) and reset at restart. | Accepted for one instance; move to Redis if the demo is abused. |
| 5 | Low | Forwarded IP | uvicorn runs with `--forwarded-allow-ips '*'`: anyone who could reach `api:8000` directly could spoof `X-Forwarded-For` and dodge per-IP limits. | Accepted: only Caddy publishes ports, and Caddy (no `trusted_proxies`) replaces any client `X-Forwarded-For` with the real peer address. Never publish the api port. |
| 6 | Low | CSP strength | `script-src 'unsafe-inline'` is needed by the Next.js inline bootstrap scripts (no nonce middleware). | Accepted: React escapes every template/user string and no HTML is ever built from data (`dangerouslySetInnerHTML`, `eval`, `new Function` absent from `src/`). zod probes `Function("")` once (JIT detection) and falls back silently: that one CSP report is expected. |
| 7 | Low | `GET /api/jobs/{id}` | No ownership check. | Accepted: ids are UUIDv7 (74 random bits) and a job only exposes kind, stage, progress and an error code, no project data. |
| 8 | Low | Console e-mail sender | With `AUTH_EMAIL_SENDER=console` sign-in links (bearer credentials, 15 min) are written to the api logs. | Accepted for development; the API logs `auth.console_email_sender_in_production` and `check-env.sh` warns. Use `smtp` in production. |
| 9 | Low | Redis | No password. | Accepted: internal network only, no published port. |
| 10 | Info | Dependency audit | `pip-audit` / `pnpm audit` need network access to advisory databases and were not run in this session. | Run once before submission: `cd apps/api && uvx pip-audit`, `pnpm audit --prod`. |

## Checked and fine

- **Auth and sessions:** magic-link tokens and session ids are random 256-bit values stored as SHA-256, single use,
  15 min / 30 days. Cookies `mw_session` (httpOnly, Secure, SameSite=Lax) and `mw_csrf`; every unsafe request sent
  with a session needs `X-CSRF-Token` (double submit, constant-time compare); production refuses cross-origin
  `/api/auth/*` POSTs (login CSRF). Logout needs the CSRF token. No CORS middleware (same origin only).
- **Ownership:** every `/api/projects/{id}/…` route goes through `AccessibleProjectId` → 404 for a missing or
  foreign project; store drafts, publish, thumbnail and delete are owner-only with 404.
- **Uploads:** content sniffing (MP3/WAV/FLAC, PNG/JPEG/WebP), size and duration limits, `.lrc` ≤ 64 KB UTF-8,
  content-addressed keys, object keys checked against `..` and absolute paths, ffmpeg/ffprobe called with argument
  lists (no shell), thumbnails served with their sniffed type and `nosniff`.
- **Templates and LLM output:** pydantic contract + store specification (32 KB, built-in shape kinds, staff contrast,
  plain-text name without links/markup), director output validated and clamped with the default template as last
  fallback; templates are data, never executed or interpolated into HTML/SQL/shell.
- **Rate limits:** sign-in links (per IP and per address), verify attempts, uploads, director, template publication.
- **Secrets:** settings are `SecretStr`, never returned by `/api/health` or `/api/director/providers`; no secret in
  the web bundle (architecture check); `.env` files ignored by git and `.dockerignore`; no key pattern in the
  repository history head (`git grep` for AWS, Anthropic, GitHub and private-key patterns).
- **Docs and debug routes:** FastAPI docs only in development or with `API_DOCS=true`; Caddy also answers 404 on
  `/api/docs*` and `/api/openapi.json` (route order checked with `caddy adapt`); the demo job route exists only in
  development.
- **Logging:** structured JSON; no lyrics, no e-mail addresses (hash prefix only), no secrets; 500 responses carry a
  generic body.
- **Containers:** api/worker run as uid 10001, web as `node`; only Caddy publishes ports.

## CSP browser check

The Caddyfile CSP (plus `'unsafe-eval'` and `ws:` that only `next dev` needs) was served by a throwaway Caddy in front
of `next dev`; Playwright opened `/`, `/play/demo`, `/templates`, `/upload` and `/sign-in`: no
`securitypolicyviolation` event, and the demo world renders (staff, notes, terrain) exactly as without the header.
Repeat on the public URL after the first deploy (browser console) and on the Quest (controller models come from
`cdn.jsdelivr.net`, allowed in `connect-src`).

## Dependency audit (2026-11-24)

- `uv export --no-dev --frozen | uvx pip-audit --no-deps`: **no known vulnerabilities** in the 309 locked production
  packages. `torch` and `torchaudio` (CPU wheels from the PyTorch index) cannot be audited against PyPI advisories:
  watch the PyTorch security advisories before bumping them.
- `pnpm audit --prod`: **no known vulnerabilities**.
- Repeat both before the submission (2026-12-04) and after any dependency change.
