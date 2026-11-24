# Implementation Plan

- [x] 1. API: `PUT /api/templates/{id}` (owner, draft only), use case `UpdateDraftTemplate`, repository
  `update_document`; unit and integration tests (ownership, published → 409, invalid → 422 with `loc`).
  - _Requirements: 5.1, 5.4_
- [x] 2. Pure `editor-model.ts` and `editor-validate.ts` (zod + store specification), property tests.
  - _Requirements: 2.2, 2.3, 3.1, 3.2, 6.3_
- [ ] 3. `useTemplateDraft` store and loading (`?from=`, default, error fallback); tests.
  - _Requirements: 1.1–1.3, 5.3_
- [ ] 4. Form sections (Identity, Palette, Terrain, Staff, Effects) with bounds from the schema; Testing Library tests.
  - _Requirements: 2.1, 2.2, 3.1, 6.1_
- [ ] 5. Mappings and zones editors (order, add, remove, limits, recipe kinds read-only); tests.
  - _Requirements: 2.1, 2.3, 2.4_
- [ ] 6. Live preview with `WorldHandle` template swap, debounce, last valid template; tests with a fake handle.
  - _Requirements: 3.3, 4.1, 4.2_
- [ ] 7. Save draft, publish, sign-in round trip, "Edit a copy" entry points (play page, store card); tests.
  - _Requirements: 1.1, 5.1–5.4_
- [ ] 8. Browser check (screenshot over the demo song), README, `PROJECT.md` §8, handoff, tick.
  - _Requirements: 4.1, 6.1_
