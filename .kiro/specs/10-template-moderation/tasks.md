# Implementation Plan

- [x] 1. Settings `MODERATOR_EMAILS`, `ModeratorDirectory` port and adapter, session `moderator` field
  (contract change, `make schemas`); tests (empty list, case, non-moderator).
  - _Requirements: 1.1–1.4_
- [x] 2. Migration (`moderation_actions`, `reports_since`), repository methods, `ModerationAudit` adapter; tests.
  - _Requirements: 3.1, 3.4_
- [x] 3. Use cases `ListHiddenTemplates`, `RestoreTemplate`, `RemoveTemplate` with fakes; property test on counts
  after a restore.
  - _Requirements: 2.1, 3.1, 3.2, 5.2_
- [x] 4. Router `/api/moderation/*` (404 rules, CSRF, rate limit, 409), docs in `api-specs.md`; HTTP tests.
  - _Requirements: 1.2, 1.3, 3.3, 5.1_
- [x] 5. Web `features/moderation` + `/moderation` page + navigation link from `session.moderator`; "My templates" hidden
  label; Testing Library tests.
  - _Requirements: 2.2, 2.3, 4.1_
- [ ] 6. `.env.example` files, `env.md`, `check-env.sh`, README, `PROJECT.md` §9, handoff; tick.
  - _Requirements: 1.1_
- [ ] 7. (human) Review one real hidden template on the public URL.
  - _Requirements: 2.1, 3.1_
