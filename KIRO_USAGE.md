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
