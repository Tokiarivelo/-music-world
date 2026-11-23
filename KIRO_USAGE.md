# How Kiro was used to build Music World

Running log for the Kiroween 2026 submission write-up. Updated with the manual hook "Update Kiro usage log".

## Setup

- **Steering (single source of rules):** `rules.md` is the index. Always included: `product`, `tech`, `structure`,
  `coding-standards`, `handoff`, `documentation`. File-match: `architecture` (api), `api-specs` (routers),
  `frontend` (web), `xr-iwsdk` (xr), `ai-models` (director), `testing` (tests), `infrastructure` (infra).
  `CLAUDE.md` and `AGENTS.md` only point to `rules.md`, so every agent follows the same rules.
- **Skills (`.kiro/skills/`, shared with Claude Code via a symlink):** `start`, `handoff`, `new-web-feature`,
  `new-api-module`, `analysis-stage`, `llm-provider`, `shape-kind`, `world-template`, `xr-verify`, `deploy-ovh`,
  `review-change`.
- **Custom agents (`.kiro/agents/`):** `audio-analyst`, `world-builder`, `ai-director`, `reviewer` (read-only).
- **Handoff between agents:** `docs/handoff.md` (6 fixed sections, ≤ 150 lines, task ownership table) + monthly
  archive; manual hooks "Start session" and "Write handoff".
- **Specs:** `01-foundation`, `02-music-analysis`, `03-world-engine-core`, `05-ai-world-director`
  (later: `04-default-template`, `06-template-store`, `07-xr-mode`).
- **Hooks:** architecture check (runCommand on save), engine property tests on save, schema regeneration, director
  safety review, frontend rules review, after-task docs + handoff (postTaskExecution), start session, write handoff,
  usage log (manual).
- **Architecture validator:** `scripts/agents/validate-architecture.sh` (layer boundaries, pure engine, barrel
  imports, no secrets in the web app).
- **Property-based testing:** fast-check (engine determinism, seek equivalence, LLM output validation) and
  Hypothesis (analysis invariants).

## Log

<!-- Dated entries are appended below. -->

### 2026-11-23 — 01-foundation tasks 1 + 5 (Claude Code)

- Monorepo skeleton and root `Makefile`; schema pipeline pydantic → JSON Schema → TS + zod (`make schemas`),
  drift check in `make check`. First contract `music-world.health.v1`.
- Steering change: `rules.md` absolute rule — no AI attribution in commits, PRs or comments.
- No hooks fired (work done outside Kiro IDE); no property-test findings yet.

### 2026-11-23 — 01-foundation tasks 2, 3, 4, 6.1 + engine fixture (Claude Code)

- Task 2: Next.js 16 + IWSDK 1.1.0 demo cube; IWSDK API checked in the installed typings (`World.create`,
  `launchXR`, `exitXR`, `destroy`). Found that two concurrent `World.create` calls leave one pending (React
  StrictMode) → world creation is serialized; caught by a headless-browser check (2 canvases instead of 1).
- Task 3: `AudioPlayer` clock with a fast-check reference-model property (500 runs). Mutation check: removing the
  rate rebase makes the property fail with a 3-step counterexample.
- Task 4: FastAPI + arq + jobs (Clean Architecture `projects` and `system` contexts), Hypothesis test for monotonic
  job progress, end-to-end run on real postgres + redis containers.
- Task 6.1: Dockerfiles, Compose, Caddyfile, `.env.example`. Roadmap 1.7: hand-made `AnalysisResult` fixture.
- Steering/skill/hook fixes: `pnpm --dir apps/web vitest` does not work with pnpm 10 → `pnpm -C apps/web exec vitest`.

### 2026-11-23 — 03-world-engine-core task 1.1 (Claude Code)

- `engine/prng.ts` (FNV-1a + mulberry32, per-note streams) with 12 fast-check tests.
- Mutation check found a weak property: hashing only the low byte of each UTF-16 code unit survived the random-pair
  property (pairs rarely differ only in the high byte). Replaced by a targeted property that flips bits in either
  byte of the last code unit; all 3 mutants now fail. No hooks fired (outside Kiro IDE).

### 2026-11-23 — 03-world-engine-core phase 2 tasks 1.2–5 (Claude Code as `world-builder`)

- Task 1.2: new contract `music-world.template.v1` (pydantic → JSON Schema → zod). Found that the generator turned
  every nested `$ref` into `z.any()` (the `Health.checks` object was unvalidated in TS): `$defs` are now inlined
  before conversion. `engine/mapping.ts` with fast-check properties (first match wins, pitch threshold partition,
  AND semantics). Mutation check: 5 mutants (strict `>` → `>=`, `findIndex` → `findLastIndex`, inverted chord test,
  unordered `a-b` bounds, dropped velocity condition) all killed.
- Task 1.3: `engine/layout.ts` (zones in normalized plate units, jittered grid, pitch → column). Mutation check
  found weak properties: 3 of 5 mutants survived the first "target inside its zone" property (no cell margin,
  always the first zone, random column instead of pitch — the "monotonic x" property was vacuous because both notes
  shared one PRNG stream). Added a grid-cell property (column = pitch, jitter keeps the margin) and a "uses every
  zone" check; all 5 mutants now fail.
- Task 2.1: `engine/spawn-plan.ts` + `engine/staff.ts`. Mutation check: a chord arc keyed on the *first* landing
  instead of the last survived (the fixture's chord notes share one onset); added a random-analysis property.
- Tasks 2.2–2.3: `engine/world-state.ts` + `world-state.property.test.ts` (determinism incl. input order, purity
  and seek equivalence after random call histories, frame-by-frame play == direct seek, monotonic spawn count,
  exact phase partition, budget with distinct slots, 20 000-note budget check). Mutation check: 3 of 4 mutants
  killed; the survivor (wider falling window) is equivalent because of the `landAt <= t` guard. A first version of
  the 20 000-note test drew its data through `fc.filter` and never finished — replaced by a seeded generator.
- Task 4: rendering views (`xr/views/`) + IWSDK systems (`xr/systems/world-systems.ts`), IWSDK 1.1.0 API checked
  in the installed typings (`createComponent`, `createSystem`, `Types.Object`, `registerSystem` priority order).
  View tests in jsdom: triangle budgets, cracks pulse on kicks, structure slots match the state after any seek,
  particles depend on song time only, draw calls < 40. Deviations recorded in `design.md` (procedural glyphs
  instead of Bravura SDF; no post-processing bloom in WebXR).
- Task 5: `useSongPlayer` + `PlayerBar` (keyboard: space, arrows ±5 s) and `WorldHandle.load(scene)`; the demo
  analysis is synthesized to audio in the browser so `/play/demo` runs on the real audio clock. Verified in headless
  Chromium (SwiftShader) on a production build: the world renders, pause freezes the clock, arrows seek ±5 s and
  the world jumps to the matching state. A full parallel `vitest run` hit the 5 s default timeout on property tests:
  raised `testTimeout` (no property weakened).

### 2026-11-24 — 04-default-template (Claude Code as `world-builder`)

- Task 1: spec `04-default-template` written from `PROJECT.md` §2 and the `world-template` skill checklist (EARS
  requirements, design with a reference-image breakdown table, 5 tasks).
- Tasks 2–4: camera fitted to reference landmarks (the fit pointed to a near-orthographic camera), pure terrain height
  field and crack network with determinism / zone-avoidance tests, Bravura outlines extracted by a script (font and
  OFL license shipped) and rendered as instanced geometry, window shader and equalizer needle clusters for the city,
  staff-aligned arcs and round particles. Tests cover glyph triangle budgets and notehead centring, G clef holes,
  shader-chunk injection, needle fade, arc bounds and chord-arc height cap.
- Task 5: three side-by-side passes against the reference on a production build (Playwright + SwiftShader);
  draw calls 15–16 logged with `?perf=1`; remaining mismatches recorded in the spec design.

### 2026-11-23 — 02-music-analysis (Claude Code as `audio-analyst`)

- Task 1: contract `music-world.analysis.v1` (`schemas/analysis.py`) with a model validator for the requirement 7.2
  invariants. Hypothesis builds random well-formed results (must validate and round-trip through JSON); 21
  hand-written mutations of a valid result (unsorted notes, unknown chord ids, gaps between sections, …) must each be
  rejected. Mutation check on the validator: 8 mutants, 2 survived at first (dropping the "chord notes overlap" check,
  allowing zero-length sections) → two mutations added, all 8 now killed. The Hypothesis strategy itself had a bug
  (sorted by duration before midi), caught on its first run. The engine's `EngineAnalysis` is now a `Pick` of the
  generated `Analysis` type; the fixture is parsed with the generated zod schema.
- Tasks 2–3: upload (`projects` context) with content sniffing by magic bytes (Hypothesis: any 12 bytes either map
  to mp3/wav/flac or are rejected, never crash), 25 MB / 180 s / 64 KB `.lrc` limits, SHA-256 cache; ffmpeg decode.
- Task 5: Hypothesis caught a real bug in `merge_stems`: exact duplicates kept the *last* copy, so a loud note
  could be replaced by a silent duplicate and then lost when the note cap kept "the loudest" (shrunk example: two
  notes at t = 1.0, velocities 1.0 and 0.0, cap 1). Duplicates now keep the loudest. A real-model test showed Basic
  Pitch splitting one held C4 into two touching notes → new pure `join_fragments` step with its own properties.
- Task 7: mutation check on `harmony.py` (7 mutants) and `structure.py` (3): 9 killed; the survivor (dropping the
  "already used" check in `group_chords`) is equivalent — a later anchor can never reach a note already grouped,
  because group members always precede any rejected note in onset order.
- Task 8: the property "any stage output assembles into a valid `AnalysisResult`" (200 random note sets, beats,
  sections, lyrics) caught a silent data loss: `start + (end - start)` rounding (3.5234000000000005 > 3.5234)
  dropped the last note of a song; assembly now uses the validator's 1e-6 tolerance. The slow end-to-end test
  checks determinism (same audio analysed twice from scratch → identical result; Demucs runs with `shifts=0`).
