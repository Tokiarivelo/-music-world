# Implementation Plan

- [x] 1. (6.1, P1) Create this spec (requirements, design, tasks) from `PROJECT.md` §8–§9, `api-specs.md` and
  `coding-standards.md` § Security.
  - _Requirements: all_
- [x] 2. (6.2, P1) Accounts with e-mail magic link: `accounts` context (domain, ports, use cases `RequestMagicLink`,
  `VerifyMagicLink`, `ResolveSession`, `SignOut`), SQLAlchemy repositories + Alembic migration, console and SMTP
  `EmailSender` adapters, `shared/auth.py` (`current_caller`, `require_user`, CSRF double-submit), auth routes and
  rate limits, `music-world.session.v1`; project ownership (`owner_id`, `CheckProjectAccess`, 404) on the project,
  audio, analysis and director routes, director limiter keyed by user; web `features/auth` (sign-in page,
  verification page, account badge, CSRF header). Human: real e-mail (`design.md` § Human checks).
  - _Requirements: 1.1–1.9, 2.1–2.4_
- [x] 3. (6.3, P1) Publish a template: `templates` context (store specification, store ids, thumbnail sniffing),
  repository + migration, use cases create / publish / thumbnail / get / mine / delete, routes with ownership 404 and
  publication rate limit, contracts `store-template.v1` / `store-template-page.v1`; web publish button on the player
  (any template, AI-generated included) with a generated palette thumbnail.
  - _Requirements: 3.1–3.7_
- [x] 4. (6.4, P1) Gallery and use during playback: public paginated list (featured first), web `/templates` page,
  store templates in `useAiTemplateChoice` (2D and VR picker), `?template=<store id>`, zod re-validation, offline
  fallback; run `apps/web/scripts/xr-check.mjs` once if feasible.
  - _Requirements: 4.1–4.6_
- [x] 5. (6.5, P1) Halloween template `kiroween-pumpkin-night` as a featured store template (skill `world-template`
  checklist), validated by pydantic, the store specification and zod; renders on `/play/demo?template=…`.
  - _Requirements: 5.1, 5.2_
- [ ] 6. (6.6, P2) Reports (closed reasons, one per user and template, hide at threshold) and upload rate limit.
  - _Requirements: 6.1–6.3_
- [ ] 7. (human) Real e-mail sign-in and the cross-user check on the public URL (`design.md` § Human checks).
  - _Requirements: 1.1, 1.7, 4.4_
