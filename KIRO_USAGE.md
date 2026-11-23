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
