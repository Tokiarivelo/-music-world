# Requirements Document

## Introduction

The template store lets anyone publish a world template (`music-world.template.v1`) that other people use during
playback to build their world. Templates are data only: validated on the server (pydantic) and on the client (zod),
never executed, no scripts and no external URLs. Publishing needs a simple account (e-mail magic link). The store
ships with the default `neon-nocturne` look and a Halloween template for the Kiroween theme.

Sources: `PROJECT.md` §8 (store, template contract, rules), §9 (contracts), `.kiro/steering/api-specs.md` (auth,
ownership, pagination), `coding-standards.md` (security, rate limits), roadmap Phase 6.

## Requirements

### Requirement 1 — Accounts (magic link)

**User Story:** As a creator, I want to sign in with my e-mail address only, so that I can publish templates without
a password.

#### Acceptance Criteria

1. WHEN a visitor submits an e-mail address THEN the system SHALL send a single-use sign-in link through an
   `EmailSender` port and answer `202` whether or not an account exists (no account enumeration).
2. THE sign-in token SHALL be random (≥ 256 bits), stored only as a SHA-256 hash, expire after
   `AUTH_TOKEN_TTL_MIN` (default 15) minutes and be usable once.
3. WHEN a valid, unused, unexpired token is verified THEN the system SHALL find or create the user for that e-mail,
   create a session and set an `httpOnly`, `SameSite=Lax` (and `Secure` outside local HTTP tests) session cookie.
4. IF the token is unknown, expired or already used THEN verification SHALL fail with `401 AUTH_TOKEN_INVALID`
   without telling which case applied.
5. THE session token SHALL be random, stored only as a hash, and expire after `SESSION_TTL_DAYS` (default 30); signing
   out SHALL delete the session and clear the cookies.
6. WHEN a request authenticated by the session cookie uses an unsafe method (POST, PUT, PATCH, DELETE) THEN it SHALL
   carry an `X-CSRF-Token` header equal to the `mw_csrf` cookie, otherwise `403 CSRF_FAILED`.
7. THE e-mail sender SHALL be chosen by `AUTH_EMAIL_SENDER`: `console` (development: the link is logged, the address
   is logged as a hash) or `smtp` (configured by `SMTP_*` variables); the link SHALL be built from `PUBLIC_BASE_URL`.
8. Sign-in link requests SHALL be rate-limited per client IP and per e-mail address (`429 RATE_LIMITED`).
9. THE web app SHALL offer a sign-in page, a verification page that posts the token (an e-mail scanner opening the
   link never consumes it), the signed-in address and a sign-out control.

### Requirement 2 — Project ownership

**User Story:** As a signed-in user, I want my uploaded songs to be private to me.

#### Acceptance Criteria

1. WHEN a signed-in user uploads a song THEN the project SHALL record that user as its owner.
2. IF a caller other than the owner reads an owned project (project, audio, analysis, director) THEN the system SHALL
   answer `404` as if it did not exist.
3. Projects uploaded without a session SHALL stay readable by their unguessable id (the judge path needs no login).
4. THE director rate limit SHALL be keyed by user when signed in and by client IP otherwise.

### Requirement 3 — Publish a template

**User Story:** As a creator, I want to publish a template (mine or one the AI generated), so that others can use it.

#### Acceptance Criteria

1. WHEN a signed-in user submits a template THEN the system SHALL validate it against `music-world.template.v1` and
   the store specification (≤ 32 KB, built-in shape kinds only until `ShapeRecipe`s exist, readable staff, no URL or
   markup in text fields) and store it as a `draft` owned by the user, or reject it with `422 TEMPLATE_INVALID` and
   the list of errors.
2. THE template SHALL carry a license from the closed list (`CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`, `MIT`).
3. WHEN the owner publishes a draft THEN its status SHALL become `published` with a publication time; only the owner
   SHALL publish, change the thumbnail of or delete a template (others get `404`).
4. THE store SHALL give each stored template a unique template id (the submitted id plus a short suffix), so two
   creators can publish templates with the same name and the template picker never mixes them up.
5. AN AI-generated template SHALL keep its `meta.generatedBy` when published and the gallery SHALL label it.
6. THE owner MAY attach a thumbnail: PNG, JPEG or WebP detected by content, ≤ 128 KB, ≤ 640 × 640 px, stored under a
   random object key and served with its detected type; anything else is rejected (`413` / `415` / `422`).
7. Template creation SHALL be rate-limited per user (`TEMPLATE_PUBLISH_RATE_LIMIT_PER_HOUR`, `429 RATE_LIMITED`).

### Requirement 4 — Gallery and use during playback

**User Story:** As a listener, I want to browse published templates and play my song with one of them.

#### Acceptance Criteria

1. `GET /api/templates` SHALL be public and list published templates only, newest first, with cursor pagination
   (`?cursor=&limit=`, max 50); `GET /api/templates/{id}` SHALL return a published template (or the caller's own draft).
2. Drafts and unknown ids SHALL answer `404` to anyone but their owner.
3. THE web gallery page SHALL show each template's name, author, license, AI label and a thumbnail or palette
   preview, and a "Use this template" action that opens the player with it.
4. THE player (2D and VR template picker) SHALL list the newest published store templates next to the built-in and
   AI-generated ones, and `?template=<store id>` SHALL select that store template on load.
5. EVERY store template received by the web app SHALL be validated with the generated zod schema; an invalid one is
   skipped, never rendered.
6. IF the store cannot be reached THEN playback SHALL continue with the built-in and AI-generated templates.

### Requirement 5 — Launch templates

1. THE gallery SHALL always list a Halloween template for the Kiroween theme, authored by Music World, valid against
   the schema and the store specification, and renderable by the engine within the instance budget.
2. THE default `neon-nocturne` template SHALL stay built into the player (it never depends on the store).

### Requirement 6 — Reports and abuse limits (P2)

1. WHEN a signed-in user reports a published template with a reason from a closed list THEN the report SHALL be
   recorded once per (user, template).
2. WHEN a template reaches `TEMPLATE_REPORT_HIDE_THRESHOLD` distinct reports THEN it SHALL be hidden from the gallery
   until reviewed.
3. Song uploads SHALL be rate-limited per user or client IP (`UPLOAD_RATE_LIMIT_PER_HOUR`, `429 RATE_LIMITED`).
