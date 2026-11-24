# How Kiro was used to build Music World

Write-up for the Kiroween 2026 submission (category Frankenstein). The first part is the final summary; the second
part is the dated session log it was built from (updated with the manual hook "Update Kiro usage log"). Sources: git
history (one commit per spec task, 7 merged phase PRs), the specs' `tasks.md` checkboxes and the session log below.
Numbers are only those recorded in the repository.

**How the work ran.** The `.kiro/` folder (specs, steering, skills, custom agents, hooks) is the project's operating
system. The logged coding sessions ran in a terminal agent (Claude Code) that loads the same files: `CLAUDE.md` and
`AGENTS.md` only point to `.kiro/steering/rules.md`, and `.claude/skills` is a symlink to `.kiro/skills`. Every
session started with the `start` skill and ended with the `handoff` skill, and took one spec task at a time.

## Specs

Seven specs in `.kiro/specs/`, each with `requirements.md` (EARS), `design.md` and `tasks.md` (tasks cite requirement
ids). 62 tasks ticked, 11 open — the open ones are almost all human checks (headset, credentials, server).

| Spec | How it was created | Tasks done / open | Open because |
|---|---|---|---|
| `01-foundation` | Written at project setup from `PROJECT.md` | 14 / 4 | server instance, API keys |
| `02-music-analysis` | Written at project setup | 10 / 2 | Muse Voice key (P2) |
| `03-world-engine-core` | Written at project setup | 16 / 1 | Quest 3 check |
| `04-default-template` | Created in Phase 4 from `PROJECT.md` §2 + the `world-template` skill checklist (reference-image breakdown table in the design) | 5 / 0 | — |
| `05-ai-world-director` | Requirements at setup; design + tasks generated in Phase 5 from the requirements, `ai-models.md` and the `llm-provider` skill, with provider facts verified in Meta's and Anthropic's docs | 5 / 2 | real provider calls; ShapeRecipe (P2) skipped |
| `06-template-store` | Created in Phase 6 from `PROJECT.md` §8 | 6 / 1 | real e-mail + public URL |
| `07-xr-mode` | Created in Phase 7 from `PROJECT.md` §7, `xr-iwsdk.md` and the `xr-verify` skill | 6 / 1 | Quest 3 check |

How the specs were used:

- **One task per session, one commit per task** (`<spec>: <task> <summary>`), so the git log maps 1:1 to `tasks.md`.
- **Design "As built" sections and recorded deviations**: whenever the implementation departed from the design (e.g.
  procedural glyphs then Bravura outlines, no post-processing bloom in WebXR, director port signature, generated
  thumbnail instead of a WebGL capture), the deviation was written into `design.md` and the handoff in the same change.
- **"Human checks" sections** (`05`, `06`, `07`): steps an agent cannot do (Quest 3, live credentials) are written as
  exact checklists instead of being ticked.

## Steering

`.kiro/steering/rules.md` is the single source of truth (index of rule files, skills, agents, workflow and absolute
rules); 13 rule files in total.

- **Always included:** `product` (vision, default look, MVP scope), `tech` (stack, non-negotiable rules, env table,
  perf budget), `structure`, `coding-standards`, `handoff`, `documentation` (which doc to update for which change).
- **File-match:** `architecture` (`apps/api/**`), `api-specs` (routers), `frontend` (`apps/web/src/**`), `xr-iwsdk`
  (`apps/web/src/xr/**`), `ai-models` (director), `testing` (tests), `infrastructure` (`infra/**`). Agents load only
  the rules of the area they touch.
- Steering is touched by 13 commits: it was corrected as the project learned, in the same commit as the code (e.g. body
  limits and security headers in `infrastructure.md` / `api-specs.md`, the `pnpm -C apps/web exec vitest` command, the
  rule that commits carry no tool attribution).
- `scripts/agents/validate-architecture.sh` turns steering rules into a check run by `make check`: Clean
  Architecture layer boundaries, pure engine, barrel imports, no secrets in the web app.

## Hooks (`.kiro/hooks/`, 9)

| Hook | Trigger | Action |
|---|---|---|
| Architecture check | file edited (api Python, web TS/TSX) | runs the architecture validator |
| Engine property tests on save | `apps/web/src/engine/**` edited | agent runs the engine property tests |
| Regenerate schemas | `apps/api/music_world/schemas/**` edited | agent runs `make schemas` |
| Director safety review | director / templates Python edited | agent reviews data-only LLM output, secrets, spend cap |
| Frontend rules review | pages / feature components edited | agent checks thin pages and feature-first rules |
| After spec task: docs and handoff | `postTaskExecution` | agent updates docs and the handoff |
| Start session · Write handoff · Update Kiro usage log | manual | run the `start` / `handoff` skills, append to this file |

**Honest note:** the session log records no hook firing — the sessions ran outside the Kiro IDE, where file-save
and post-task hooks do not trigger. The same checks still ran on every task through `make check` (architecture
validator, schema drift check, all tests) and through the skills' checklists.

## Custom agents (`.kiro/agents/`, 4)

| Agent | Owns | Used for |
|---|---|---|
| `world-builder` | `apps/web/src/engine`, `apps/web/src/xr` | Phase 2 (engine), Phase 4 (default look), Phase 7 (XR mode) |
| `audio-analyst` | `apps/api/music_world/analysis` | Phase 3 (analysis pipeline, demo song) |
| `ai-director` | `apps/api/music_world/director` | Phase 5 (providers, prompts, validation) |
| `reviewer` (read-only) | review checklist | Phase 8 whole-app security review (`docs/security-review.md`) |

Ownership of every task is recorded in `docs/handoff.md` § 4, so two agents never work on the same task.
`world-builder` is the only agent with `includeMcpJson: true` (see MCP below).

## Skills (`.kiro/skills/`, 11)

`start` and `handoff` framed every session. Area skills were used as checklists: `new-api-module` and `new-web-feature`
(projects, director, templates, auth contexts and features), `analysis-stage` (each analysis stage), `llm-provider`
(Muse, Bedrock, mock), `world-template` (default look and the Halloween template), `xr-verify` (IWER checks, Quest
steps), `review-change` and `deploy-ovh` (Phase 8). `shape-kind` was not needed (no new shape kind was added; the
Halloween template reuses built-in kinds). Skills were corrected in the same commit as the code when a command in them
turned out wrong (e.g. the `deploy-ovh` steps in Phase 8).

## Handoff between agents

`docs/handoff.md` has 6 fixed sections and ≤ 150 lines (repository state, last session, next actions, task ownership,
active pitfalls, open specs), with a monthly archive. Any agent resumes with one line: "Read docs/handoff.md and
continue with the next actions." The "Active pitfalls" section accumulated the traps that cost time once (IWSDK
concurrent `World.create`, the Basic Pitch / TensorFlow override, CPU-only torch, CSRF on web calls…).

## Property-based testing findings

fast-check (web engine, player clock, XR helpers) and Hypothesis (analysis, upload, director, store). After writing
a property, most sessions ran a **mutation check**: inject plausible bugs by hand and confirm a property fails.

**Real bugs found by properties**

1. `merge_stems` (analysis): exact duplicate notes kept the *last* copy, so a loud note could be replaced by a silent
   duplicate and then dropped by the "keep the loudest" note cap. Shrunk example: two notes at t = 1.0, velocities
   1.0 and 0.0, cap 1.
2. Analysis assembly: `start + (end - start)` rounding (3.5234000000000005 > 3.5234) silently dropped the last note of
   a song; found by "any stage output assembles into a valid `AnalysisResult`" (200 random inputs).
3. Basic Pitch split one held note into two touching notes (real-model test) → new pure `join_fragments` step with
   its own properties.

**Weak or vacuous tests found (by mutation checks)**

| Area | Mutants | Finding |
|---|---|---|
| Player clock | 1 | removing the playback-rate rebase fails with a 3-step counterexample |
| PRNG | 3 | hashing only the low byte of UTF-16 units survived random pairs → targeted bit-flip property |
| Engine mapping, layout, spawn plan, world state | 17 | 4 initial survivors: "target inside its zone" missed 3 layout bugs; "monotonic x" was vacuous (both notes shared one PRNG stream); a chord arc keyed on the first landing survived. All fixed with stronger properties; 1 survivor proven equivalent |
| Analysis schema validator + harmony/structure | 18 | 2 validator mutants survived (missing "chord notes overlap" check, zero-length sections) → mutations added; 1 equivalent survivor in `group_chords` |
| AI director output validation | 5 | first near-valid Hypothesis strategy produced 0 % renderable documents (shrinking biased toward the invalid branch), so the property held vacuously; fixed and checked with `--hypothesis-show-statistics` (~20 % renderable). The staff contrast mutant was caught only after adding contrast to the oracle |

Other lessons: a Hypothesis strategy had its own bug (sorted by duration before pitch), caught on its first run; a
20 000-note budget test built with `fc.filter` never finished and became a seeded generator; a full parallel
`vitest run` hit the 5 s default timeout, so the timeout was raised rather than weakening a property.

Properties that guard the product rules: `worldStateAt` determinism, purity, seek equivalence after random call
histories and "frame-by-frame play == direct seek"; any provider JSON is rejected or renderable; analysis
invariants; upload sniffing never crashes on arbitrary bytes; store ids always valid; XR tabletop placement for any
head pose; pinch hysteresis.

## MCP

`PROJECT.md` planned the Meta docs MCP server for IWSDK / WebXR facts, and `world-builder` is configured with
`includeMcpJson: true` and told to verify IWSDK API names against Meta's docs before coding. In the logged sessions,
IWSDK 1.1.0 and IWER 2.8.0 APIs were verified in the **installed typings and sources** (`World.create`, `launchXR`,
`createSystem`, `PanelUI`, `getPinchStrength`…), and provider facts in Meta's and Anthropic's published docs (links in
`05-ai-world-director/design.md`). No MCP call is recorded in the session log, and the repository has no workspace MCP
configuration.

## Spec-driven vs vibe coding

All seven features were built spec-first. The closest thing to a vibe-coded phase is Phase 8 (hardening and deploy
readiness), which had no spec — only a roadmap table and the `review-change` / `deploy-ovh` skills. Observed in the
repository:

- Spec phases produced reviewable traces for free: requirement ids on every task, "As built" sections with measured
  numbers (Demucs 325.7 s wall for a 3-minute song, 15–16 draw calls for the default look, ≈ 6.2 ms stereo frame in
  IWER) and explicit deviations.
- Phase 8 needed a written artifact to have the same value: the security review became `docs/security-review.md`
  (2 medium findings fixed, no high), and the runbook `infra/README.md`.
- Small fixes outside a spec task (wrong commands in skills, steering corrections) were done directly and recorded
  in the handoff; that worked because the change was small and the rules said where to document it.

## What worked

- One rule source for every agent, plus a fixed-size handoff: 7 phases merged through PRs, sessions resumed from one
  line, no two agents on the same task.
- Property tests + hand-made mutants: they found 3 real data-loss bugs and 6 weak or vacuous properties that plain
  example tests would have hidden.
- The schema pipeline (pydantic → JSON Schema → zod) with a drift check: it found that the generator turned nested
  `$ref`s into `z.any()` (unvalidated objects in TypeScript), fixed by inlining `$defs`.
- Turning steering into executable checks (`validate-architecture.sh`, `make check`) made the rules hold even where
  hooks did not fire.

## What did not work (or not yet)

- Hooks never fired in the logged sessions (outside the Kiro IDE); `make check` had to play their role.
- The Meta docs MCP was not exercised; API facts came from installed typings instead.
- Agent-only verification stops at the emulator and fixtures: the Quest 3 check, real Muse / Bedrock calls, real
  e-mail and the deployment are human tasks (see `docs/handoff.md`).
- Some agent shortcuts were traps recorded as pitfalls (e.g. `pkill -f` killing the agent's own shell, Next 16
  auto-writing `apps/web/AGENTS.md`).

---

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

### 2026-11-25 — 07-xr-mode tasks 1–6 (Claude Code, `world-builder`)

- Spec `07-xr-mode` created from `PROJECT.md` §7, `xr-iwsdk.md` and the `xr-verify` skill (7 requirements, EARS).
- IWSDK 1.1.0 / IWER 2.8.0 APIs checked in the installed typings and sources before use (`visibilityState`,
  `input.xr.gamepads`, `getPinchStrength`, `PanelUI` runtime `.uikitml` parsing, `Hovered`).
- Property tests: tabletop placement (distance, height, front edge faces the head for any head pose), yaw extraction
  independent of pitch/roll, pinch hysteresis (edges alternate, never press below 0.75).
- New verification tool `apps/web/scripts/xr-check.mjs`: drives IWER from Playwright (27 checks) and recompiles every
  program with super-three's multiview rewrite on `OVR_multiview2` — the building window shader is multiview-safe.
- No Kiro hooks fired (work done outside the Kiro IDE).

### 2026-11-25 — 05-ai-world-director (Claude Code, `ai-director`)

- Spec design + tasks generated from `requirements.md`, `PROJECT.md` §5–§6, `ai-models.md` and the `llm-provider`
  skill; provider facts verified in the Meta Model API and Claude-in-Bedrock docs (links in `design.md`).
- Property test (Hypothesis) "any provider JSON is rejected or a renderable template", with an oracle written from the
  web engine's rules. **Finding:** the first near-valid strategy produced 0 % renderable documents (Hypothesis shrinks
  toward index 0, which picked the invalid branch) — the property held vacuously. Fixed the bias, then checked with
  `--hypothesis-show-statistics` (~20 % renderable).
- Mutation checks, each caught by the property tests: recipe kinds allowed, staff/background contrast rule removed
  (caught only after adding contrast to the oracle), minimum clamp removed, NaN kept, model-provided `id` kept.
- No Kiro hooks fired (work done outside the Kiro IDE).

### 2026-11-26 — 06-template-store (Claude Code)

- Spec `06-template-store` created from `PROJECT.md` §8 (EARS requirements, design, tasks with requirement refs);
  tasks 1–6 implemented with the `new-api-module`, `new-web-feature` and `world-template` skills.
- Property tests (Hypothesis): e-mail normalization (idempotent, never keeps whitespace or control characters), store
  template ids always valid kebab-case ≤ 60 chars, thumbnail sniffing never crashes on arbitrary bytes.
- **Finding** (live Playwright check): an anonymous visitor playing another user's store template was offered
  "Sign in to publish" (republishing someone else's template); the publish button is now limited to templates
  generated in the session. Second finding: the VR panel has 4 template slots, so store templates listed before the
  generated ones would have pushed AI worlds out of VR — order changed and the IWER check extended.
- No Kiro hooks fired (work done outside the Kiro IDE).

### 2026-11-24 — Roadmap Phase 8 prep (Claude Code): hardening and deploy readiness

- Skills used: `start`, `review-change` (security review over the whole app, `reviewer` agent checklist),
  `deploy-ovh` (made executable end to end: `infra/deploy.sh`, `make check-env`, runbook), `handoff`.
- Review result in `docs/security-review.md`: no high finding; two medium findings fixed with tests (request bodies
  spooled to disk before the upload size check → body-limit middleware + Caddy `request_body`; missing CSP and
  clickjacking headers → Caddy CSP checked in Chromium). Production settings guard added.
- Uptime pieces: log rotation, backup/disk/health scripts and cron file, restore runbook, Demucs weights in the image.
- Steering updated: `infrastructure.md` (limits, headers, uptime), `api-specs.md` (body limit, production guard).

### 2026-11-24 — Roadmap Phase 9 submission docs (Claude Code)

- Skills used: `start`, `handoff`. README rewritten for judges (2-minute test path, features, architecture,
  third-party licenses, known limitations); this file gained the final write-up above from the git log, specs and
  the earlier entries; `docs/submission.md` holds drafts of the video script, Devpost text and social post for the
  human. No hooks fired (outside the Kiro IDE); no new property-test findings.
