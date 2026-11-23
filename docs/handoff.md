# Handoff

> **Date:** 2026-11-23 · **Last updated by:** Claude Code (`world-builder`, roadmap Phase 2 — world engine core)
> **Format:** 6 fixed sections, **150 lines max**, rewritten at each handoff (see `.kiro/steering/handoff.md`).
> Previous sessions: `docs/handoff-archive/<YYYY-MM>.md` (not read by default).

Resume line for a new session or agent:

```text
Read docs/handoff.md and continue with the next actions.
```

## 1. Repository state

- Phase 2 worked on branch `phase-2-world-engine` (one commit per spec task, `1fa66bb` … `a69236e` + this handoff),
  merged into `main` through the PR "Phase 2: world engine core". Work from `main` (or a new phase branch).
  Push with gh credentials: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin <branch>`.
- Uncommitted: none.
- `make check` green: API pytest 42 passed · web vitest 94 passed (12 files) · ruff, mypy strict, eslint, tsc clean ·
  schema drift check ok · architecture check ok.
- Verified live (headless Chromium + SwiftShader, `pnpm build` + `next start`): `/play/demo` renders the diorama, plays
  the synthesized demo song, pause freezes, arrows seek ±5 s and the world jumps to the matching state.
  Server stopped. No services running.
- Another project's postgres (`angaly_postgres`) holds host port 5432 — leave it alone; our stack publishes only 80/443.

## 2. Last session (2026-11-23, Claude Code as `world-builder`)

- `03-world-engine-core` tasks 1.2–5 done. New contract `music-world.template.v1`
  (`apps/api/music_world/schemas/template.py`, generated zod `TemplateSchema` / type `Template`); PROJECT.md §8/§9
  updated. Schema generator now inlines `$defs` (nested objects were `z.any()` before, e.g. `Health.checks`).
- Engine (`apps/web/src/engine`): `mapping.ts`, `layout.ts`, `staff.ts`, `spawn-plan.ts`, `world-state.ts`,
  `constants.ts`, `types.ts` (`EngineAnalysis` = subset of analysis v1). Property tests: determinism (incl. input
  order), purity + seek equivalence, monotonic spawn count, exact phase partition, budget (20 000 notes).
- Default template `apps/web/src/templates/default/neon-nocturne.json` (+ `DEFAULT_TEMPLATE`), validated by zod and
  pydantic tests.
- Rendering: `xr/views/*` (terrain, staff + notes, structures, fx) wrapped by IWSDK systems in
  `xr/systems/world-systems.ts` (`ClockComponent`, `ClockSystem` priority -100). `WorldHandle.load(scene)`.
- `/play/demo`: `features/player` `DemoPlayback` = demo analysis synthesized to audio (OfflineAudioContext) +
  `useSongPlayer` + `PlayerBar` (space / arrows). The demo cube is gone.
- Deviations (in `03-world-engine-core/design.md` § Rendering "As built"): procedural glyphs instead of Bravura SDF;
  no post-processing bloom (glow via unlit/additive materials); `NoteSystem` merged into `StaffSystem`.
- Mutation checks: 17 mutants over mapping/layout/spawn-plan/world-state; 4 initial survivors led to stronger
  properties, 1 equivalent mutant (details in `KIRO_USAGE.md`).
- `vitest.config.ts`: `testTimeout` 60 s (property tests timed out at 5 s under the full parallel run).

## 3. Next actions

Plan, priorities and dates: `docs/roadmap.md` (read only the current phase).

1. **Human** — roadmap Phase 0: Kiro credits request (before **2026-12-01 12:00 PT**), OVHcloud instance, keys,
   demo song.
2. Roadmap 3 (`audio-analyst`) — `02-music-analysis` task 1 (schemas: `AnalysisResult` v1) — `design.md` § Data
   model. Then make `EngineAnalysis` (engine/types.ts) the generated type (it is a structural subset) and switch the
   fixture test to the generated schema (TODO in `demo-analysis.test.ts`).
3. Roadmap 4 (`world-builder`) — create `04-default-template` spec with Kiro, then `03-world-engine-core` task 6
   (side-by-side screenshot vs `assets/reference-image-original.png`): camera angle, city density (lit windows),
   Bravura SDF glyphs with halo, mountain shapes, arc look. Files: `xr/constants.ts`, `xr/views/*`,
   `templates/default/neon-nocturne.json`. Skill `world-template`.
4. Roadmap 7a — Enter VR check of the diorama in IWER, then `03-world-engine-core` task 7 on a Quest 3 (human with
   headset) — skill `xr-verify`.
5. Later: `01-foundation` 6.2 (S3 smoke test), 6.3 (deploy + Quest check), 7 (API keys) once credentials exist.

## 4. Task ownership

| Task | Owner | Status | Note |
|---|---|---|---|
| 01-foundation 1–5, 6.1 | Claude Code | done | merged |
| 01-foundation 6.2, 6.3 | — | todo | needs OVHcloud instance + bucket |
| 01-foundation 7 | — | blocked | needs API keys (human) |
| 02-music-analysis 1–10 | Claude Code (audio-analyst) | in progress | roadmap Phase 3, branch `phase-3-music-analysis` |
| 03-world-engine-core 1–5 | Claude Code (world-builder) | done | merged with Phase 2 PR |
| 03-world-engine-core 6 | world-builder | todo | Phase 4 (default look checkpoint) |
| 03-world-engine-core 7 | — | blocked | needs a Quest 3 (human); IWER first check possible |
| 05-ai-world-director | ai-director | todo | generate design.md + tasks.md with Kiro first; template contract exists |

## 5. Active pitfalls

- IWSDK 1.1.0: never run two `World.create` at once (one never resolves) — use `createMusicWorld` (queued).
- IWSDK sizes its canvas to the **window**, not the container: 2D controls must be absolutely positioned above it
  (see `DemoPlayback`), otherwise the canvas intercepts clicks.
- IWSDK enables its dev MCP runtime when `import.meta.env` is undefined (always in Next): it only sets
  `window.FRAMEWORK_MCP_RUNTIME`, no network. Harmless.
- Desktop Chrome exposes an empty native `navigator.xr`: IWER must be force-installed in dev (handled).
- Next 16 auto-writes `apps/web/AGENTS.md` on `next dev`; disabled with `agentRules: false` — keep it off.
- `next start` warns with `output: standalone` but works for local checks; Docker uses the standalone server.
- Do not add a `packageManager` field to `package.json` (corepack download times out here).
- `three` must stay aliased to the super-three version IWSDK depends on; bump both together.
- Generated TS (`templates/generated`) and `packages/schemas` are produced by `make schemas` — never edit by hand.
  The generated template type is `Template` (file name `template.v1`), aliased `WorldTemplate` in the engine.
- zod does not re-check pydantic `model_validator`s (e.g. zone `min < max`): the engine must stay defensive.
- No repo Prettier config: format with `npx prettier --print-width 120 --single-quote` (plain `npx prettier`
  reflows to 80 columns).
- Playwright's bundled headless shell is missing; use `executablePath`
  `~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` with `--use-angle=swiftshader`.
- `worldStateAt` allocates objects per frame (fine for the demo); revisit with typed arrays if Quest GC stutters
  (task 7).
- Meta Model API is in preview: re-verify model ids and the Muse Voice request format before coding.
- Deadline: Kiroween submission **2026-12-04 14:00 PT**; demo audio must be royalty-free.

## 6. Open specs

| Spec | Status | Next task | Section to read |
|---|---|---|---|
| 01-foundation | 1–5, 6.1 done | 6.2 / 7 (blocked on credentials) | design.md § Infra |
| 02-music-analysis | not started | 1 | design.md § Data model |
| 03-world-engine-core | 1–5 done | 6 (Phase 4), 7 (Quest) | design.md § Rendering "As built" |
| 05-ai-world-director | requirements only | create design + tasks | requirements.md |
| 04-default-template, 06-template-store, 07-xr-mode | to create with Kiro | — | PROJECT.md §2, §8, §7 |
