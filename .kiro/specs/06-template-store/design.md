# Design Document — 06 Template Store

## Overview

Sources: `requirements.md`, `PROJECT.md` §8 (store rules), §9 (contracts), `api-specs.md` (auth, ownership,
pagination), `coding-standards.md` § Security, `architecture.md`, `frontend.md`, skill `world-template`.

Two new backend bounded contexts and two web features:

```text
web features/auth ── POST /api/auth/magic-link ─► accounts: RequestMagicLink ─► EmailSender (console | smtp)
  /sign-in            POST /api/auth/verify     ─► VerifyMagicLink ─► session cookie (mw_session) + mw_csrf
  /auth/verify        GET  /api/auth/session    ─► ResolveSession
                      POST /api/auth/logout     ─► SignOut
web features/template-store
  /templates (gallery) GET /api/templates        ─► templates: ListPublishedTemplates (featured first)
  player picker        GET /api/templates/{id}   ─► GetStoreTemplate
  Publish button       POST /api/templates       ─► CreateStoreTemplate (spec + rate limit)
                       POST /api/templates/{id}/publish, PUT|GET /api/templates/{id}/thumbnail, DELETE …
```

`shared/auth.py` holds the FastAPI dependencies `current_caller` / `require_user`: they read the `mw_session` cookie,
resolve it through the accounts use case found on the container (no cross-context import) and enforce CSRF. Every
other context receives a plain `Caller(user_id, display_name)`.

## Accounts (requirement 1)

Choice: **e-mail magic link** (`PROJECT.md` §8 allows magic link or GitHub OAuth). It needs no third-party app
registration and is fully testable without credentials through the `EmailSender` port: `console` adapter in
development (logs the link, never the address — only its hash), `smtp` adapter configured by env. GitHub OAuth is not
built (one sign-in method is enough for the MVP; it can be added later as a second adapter of the same session code).

- Domain (`accounts/domain/`): `User(id, email, display_name, created_at)`, `Session(token_hash, user_id, expires_at)`,
  `normalize_email` (trim, lowercase, ≤ 254 chars, one `@`, a dot in the domain, no spaces/control characters),
  `hash_token` (SHA-256 hex), errors `EMAIL_INVALID` (422), `AUTH_TOKEN_INVALID` (401), `AUTH_REQUIRED` (401),
  `CSRF_FAILED` (403). `display_name` defaults to `creator-<6 hex of the user id hash>`: the gallery never shows an
  e-mail address.
- Tokens: `secrets.token_urlsafe(32)` (256 bits). Sign-in token TTL `AUTH_TOKEN_TTL_MIN` (15); only `sha256(token)` is
  stored (`auth_tokens`). Consumption is one atomic `UPDATE … SET used_at = now WHERE token_hash = ? AND used_at IS
  NULL AND expires_at > now RETURNING email`, so a token works once even under concurrent requests.
- Sessions: new random token per sign-in, stored as `sha256` in `sessions` with `expires_at = now + SESSION_TTL_DAYS`.
  Cookie `mw_session`: `HttpOnly; SameSite=Lax; Path=/; Max-Age`; `Secure` unless `SESSION_COOKIE_SECURE=false`
  (browsers accept `Secure` cookies on `http://localhost`, so the default is `true` everywhere).
- CSRF: double-submit token. Sign-in also sets `mw_csrf` (random, readable by JS, same attributes, not `HttpOnly`).
  For POST / PUT / PATCH / DELETE with a valid session cookie, `X-CSRF-Token` must equal `mw_csrf`
  (`hmac.compare_digest`) or the request fails with `403 CSRF_FAILED`. `SameSite=Lax` already blocks cross-site
  POSTs; the token covers older browsers and same-site subdomains. In `production`, unsafe `/api/auth/*` requests
  whose `Origin` header is present and differs from `PUBLIC_BASE_URL` are refused too (login CSRF).
- The link is `PUBLIC_BASE_URL + /auth/verify?token=…`. The web page `/auth/verify` reads the token and **POSTs** it to
  `/api/auth/verify`, so link scanners that only GET the page never consume it. The token is removed from the URL
  (`history.replaceState`) after reading.
- Rate limits (in memory, `SlidingWindowLimiter`): magic links `AUTH_RATE_LIMIT_PER_HOUR` (default 10) per client IP
  and 5 per e-mail hash; verify 30 per IP per hour.
- `GET /api/auth/session` always answers `200` with `{ user: {id, email, displayName} | null }` (own data only).

## Project ownership (requirement 2)

- `projects.owner_id` (nullable). `CreateProject.execute(path, lrc, owner_id=None)` stores the caller's id.
- `CheckProjectAccess(project_id, caller_id)` (projects use case) raises `ProjectNotFoundError` when the project is
  missing or `owner_id` is set and differs from the caller. The project, audio, analysis and director routes call it
  first through a router dependency (routers stay thin; the analysis and director use cases are unchanged).
- Anonymous projects (`owner_id` null) stay readable by id: UUIDv7 ids carry 74 random bits and the demo / judge path
  needs no account.
- The director limiter key becomes `user:<id>` when signed in, `ip:<client ip>` otherwise.

## Store templates (requirements 3, 4)

- Context `templates/`. Domain: `StoreTemplate(id, owner_id, template_id, author_name, status, document, thumbnail_key,
  thumbnail_type, created_at, published_at, featured)`; status `draft | published | hidden`.
- Validation (`CreateStoreTemplate`): `WorldTemplate.model_validate` (pydantic, `music-world.template.v1`), then the
  store specification `templates/domain/specification.py` on the normalized JSON: ≤ 32 KB, built-in shape kinds only
  (mappings and zones; `recipe:*` waits for `ShapeRecipe`s), staff/background luminance difference ≥ 0.2, text fields
  (`name`) without URLs (`://`, `www.`, `data:`), markup (`<`, `>`) or control characters. Errors → `422
  TEMPLATE_INVALID` with `details = [{loc, msg}]`.
- Store id = UUIDv7 row id. Template id = `<submitted id truncated to 51>-<last 8 hex of the row id>`, written into the
  stored document, so ids are unique in the picker (requirement 3.4). `meta.generatedBy` is kept as submitted (the
  director stamps it; on the store it is a label, not a proof).
- Body `POST /api/templates`: `{template, publish?: false}`; `publish: true` creates and publishes at once.
- Thumbnail: `templates/domain/thumbnail.py` sniffs PNG (`\x89PNG`, IHDR size), JPEG (`FF D8 FF`, SOF0–SOF15 size) and
  WebP (`RIFF…WEBP`, VP8 / VP8L / VP8X size); > 128 KB → `413 THUMBNAIL_TOO_LARGE`, other type → `415
  THUMBNAIL_TYPE_UNSUPPORTED`, unreadable or > 640 × 640 → `422 THUMBNAIL_INVALID`. Stored at
  `templates/thumbnails/<random hex>.<ext>`; served with the detected type, `X-Content-Type-Options: nosniff` and
  `Cache-Control: public, max-age=300`. A replaced thumbnail object is left in the store (no delete in the object-store
  port; small and bounded by the rate limit).
- The web generates the thumbnail from the template (deterministic 256 × 256 WebP/PNG palette preview drawn on a 2D
  canvas: plate, staff, city bars). Capturing the WebGL canvas needs `preserveDrawingBuffer` in IWSDK's renderer and
  is not done (deviation from "capture générée", recorded here).
- Gallery: `GET /api/templates?cursor=&limit=` (default 24, max 50) → `{items, nextCursor}`; published only, newest
  first by `(published_at, id)`; cursor = base64url of `<published_at ISO>|<id>`. Featured templates come first on the
  first page. Items carry the full template (≤ 32 KB each) so the player can offer them without N extra requests.
- `GET /api/templates/mine` (signed in): own drafts and published templates. `GET /api/templates/{id}`: published, or
  the caller's own; else `404`. `POST /{id}/publish`, `PUT /{id}/thumbnail`, `DELETE /{id}`: owner only, else `404`.
- Rate limit: `TEMPLATE_PUBLISH_RATE_LIMIT_PER_HOUR` (default 10) creations per user.

## Featured / launch templates (requirement 5)

- `templates/infrastructure/featured/*.json` holds store templates shipped with the app (author "Music World",
  status `published`, fixed UUIDv7-shaped ids `00000000-0000-7000-8000-0000000000xx`), loaded and validated by the
  store specification at start-up through the `FeaturedCatalog` port. They are always in the gallery, need no database
  row, cannot be modified or reported, and a broken file fails the test suite.
- `kiroween-pumpkin-night`: Halloween palette (night `#0b0612`, plate `#1d1226`, pumpkin orange `#ff7a1a`, ghost green
  `#7dff6a`, witch purple `#8a3cff`, bone staff `#fff4e0`), crystals (tombstones) for low notes, buildings (haunted
  city) mid, spikes for high notes, dust particles, `CC-BY-4.0`. `neon-nocturne` stays built into the web player.

## Contracts (exported, `PROJECT.md` §9)

| Schema id | Model | Use |
|---|---|---|
| `music-world.session.v1` | `AuthSession {user: {id, email, displayName} \| null}` | verify, session |
| `music-world.store-template.v1` | `StoreTemplate {id, template, status, author: {displayName}, featured, thumbnailUrl, createdAt, publishedAt}` | one template |
| `music-world.store-template-page.v1` | `StoreTemplatePage {items, nextCursor}` | gallery, mine |

Request bodies (`MagicLinkRequest {email}`, `VerifyRequest {token}`, `CreateStoreTemplateRequest {template, publish}`,
`ReportRequest {reason}`) are pydantic models in `schemas/` that are not exported (the web builds them inline).

## Persistence (Alembic `0003_accounts_templates`)

`users(id uuid pk, email varchar(254) unique, display_name varchar(40), created_at)`,
`auth_tokens(token_hash char(64) pk, email, expires_at, used_at null, created_at)`,
`sessions(token_hash char(64) pk, user_id uuid idx, expires_at, created_at)`, `projects.owner_id uuid null idx`,
`store_templates(id uuid pk, owner_id uuid idx, template_id varchar(60) unique, author_name, status varchar(16),
document json, thumbnail_key null, thumbnail_type null, created_at, published_at null, report_count int default 0)`
with index `(status, published_at)`. Expired tokens and sessions are ignored on read (a cleanup job is not needed for
the MVP volume).

## Web

- `features/auth`: `api/auth.api.ts` (magic link, verify, session, logout; zod `AuthSessionSchema`),
  `lib/csrf.ts` (reads `mw_csrf`, used by every unsafe call of the web app), `hooks/use-session.ts`,
  `components/SignInForm.tsx`, `VerifyMagicLink.tsx`, `AccountBadge.tsx`; pages `/sign-in`, `/auth/verify`.
- `features/template-store`: `api/template-store.api.ts` (list, get, create/publish, thumbnail; every template
  re-validated with `TemplateSchema`, invalid items dropped), `lib/thumbnail.ts` (palette preview canvas),
  `hooks/use-gallery.ts`, `use-store-templates.ts` (newest published for the player + `?template=` one),
  `use-publish-template.ts`, components `TemplateGallery`, `TemplateCard`, `PublishTemplateButton`; page `/templates`.
- Player: `useAiTemplateChoice(director, storeTemplates, initialId)` = built-ins → store → generated; the VR picker
  gets the same list. `DemoPlayback` / `ProjectPlayback` read `?template=` through `useSearchParams` (pages stay thin).
- Strings in `consts/`; text rendered with React text nodes only.

## Configuration (new env vars)

| Env var | Default | Use |
|---|---|---|
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Origin of the web app: sign-in links, production Origin check |
| `AUTH_EMAIL_SENDER` | `console` | `console` (link logged, development) or `smtp` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS` | —, `587`, —, —, —, `true` | SMTP sender (password server only) |
| `AUTH_TOKEN_TTL_MIN` | `15` | Sign-in link lifetime |
| `SESSION_TTL_DAYS` | `30` | Session lifetime |
| `SESSION_COOKIE_SECURE` | `true` | `Secure` attribute of the cookies |
| `AUTH_RATE_LIMIT_PER_HOUR` | `10` | Sign-in links per client IP |
| `TEMPLATE_PUBLISH_RATE_LIMIT_PER_HOUR` | `10` | Store templates created per user |
| `TEMPLATE_REPORT_HIDE_THRESHOLD` | `3` | Distinct reports that hide a template (P2) |
| `UPLOAD_RATE_LIMIT_PER_HOUR` | `20` | Song uploads per user or IP (P2) |

## Testing

- Domain: e-mail normalization (Hypothesis: idempotent, never accepts whitespace/control chars), store id suffix,
  store specification, thumbnail sniffing (valid headers of each type, truncated / oversize / wrong magic).
- Application with fakes: magic link (202 for any address, token hashed, TTL), verify (single use, expired, unknown →
  same error), session resolve / sign-out; create / publish / thumbnail / delete with ownership 404; featured first.
- Infrastructure: SQLAlchemy repositories on SQLite (`aiosqlite`), atomic token consumption, cursor pagination;
  SMTP adapter with a fake `smtplib.SMTP`; console sender logs no address.
- Interfaces (httpx `AsyncClient`, `https://test`): full sign-in flow with the console sender capturing the link,
  cookie attributes, CSRF 403, ownership 404 on projects and templates, public gallery, rate limits 429.
- Web: api parsing (invalid templates dropped), `useSession`, `SignInForm`, `VerifyMagicLink`, gallery card,
  `useAiTemplateChoice` with store templates and `?template=`.

## Human checks (not done — need credentials or a headset)

1. Real e-mail: set `AUTH_EMAIL_SENDER=smtp` and `SMTP_*` in `infra/.env`, request a link on `/sign-in`, open the
   e-mail on another device, check sign-in, then sign out. Check the e-mail is not flagged as spam (SPF/DKIM of the
   sender domain).
2. On the public URL: publish a template from `/play/demo` (signed in), open `/templates` in a private window, "Use
   this template" → the world uses it; in VR the template picker lists it (`xr-verify`).

## As built (Phase 6)

- Task 2: `apps/api/music_world/accounts/` — domain (`model.py`: `normalize_email`, `hash_token`,
  `default_display_name`; `errors.py`), application (`ports.py`, `use_cases/sign_in.py`: `RequestMagicLink`,
  `VerifyMagicLink`, `ResolveSession`, `SignOut`), infrastructure (`sqlalchemy_repositories.py` with the atomic
  `UPDATE … RETURNING` consumption, `email_senders.py` console + SMTP with one retry on connection errors), interfaces
  (`http.py`). `shared/auth.py` (`Caller`, `current_caller`, `require_user`, `check_csrf`, `AccessibleProjectId`),
  `projects/.../check_project_access.py`, `Project.owner_id`, migration `0003_accounts_templates` (also creates
  `store_templates` for task 3; upgrade/downgrade checked on SQLite). `RateLimitedError` moved to `shared/errors.py`.
  Web: `src/lib/api-client.ts` (`apiFetch` adds `X-CSRF-Token` on unsafe methods; used by upload, director, auth),
  `features/auth` (`SignInForm`, `VerifyMagicLink`, `AccountBadge`, `AccountMenu`, `useSession`), pages `/sign-in`,
  `/auth/verify` (token passed from `searchParams`). The CSRF check runs only when the request carries a valid session
  (an anonymous upload needs no token). A failing SMTP send answers `503 EMAIL_UNAVAILABLE`.
