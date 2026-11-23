# Handoff

> **Date:** 2026-11-23 · **Last updated by:** Claude Code (roadmap phase 1: 01-foundation 1–6.1 + engine fixture)
> **Format:** 6 fixed sections, **150 lines max**, rewritten at each handoff (see `.kiro/steering/handoff.md`).
> Previous sessions: `docs/handoff-archive/<YYYY-MM>.md` (not read by default).

Resume line for a new session or agent:

```text
Read docs/handoff.md and continue with the next actions.
```

## 1. Repository state

- Branch `main`, one commit per task (`722de54` … `a133fd7` + this handoff). **Not pushed**: the agent has no
  GitHub credentials for HTTPS; the user pushes with `git push origin main`.
- Working tree clean after the handoff commit.
- `make check` green: API pytest 28 passed · web vitest 14 passed · ruff, mypy strict, eslint, tsc clean ·
  schema drift check ok · architecture check ok.
- Verified live: `make dev` stack (caddy, web, api, worker, postgres, redis) all healthy; `https://localhost/api/health`
  ok; demo job queued → done through the worker; `/api/docs` blocked by Caddy; `/play/demo` renders the cube
  (prod build). Stack stopped afterwards (`docker compose down`, volumes kept). No services running.
- Another project's postgres (`angaly_postgres`) holds host port 5432 — leave it alone; our stack publishes only 80/443.

## 2. Last session (2026-11-23, Claude Code)

- Task 2: Next.js 16.4 + `@iwsdk/core` 1.1.0 + IWER 2.8 in `apps/web`; `three` aliased to `npm:super-three@0.185.0`
  (IWSDK's build). `src/xr/world-host.ts` + `features/world-view`. Checked headless: cube visible, Enter VR in IWER.
  Deviations recorded in `01-foundation/design.md` § Web: IWER installed with `forceInstall` only when no native
  immersive-vr; world creation serialized (concurrent `World.create` hangs); dispose = exitXR + destroy + renderer
  dispose + context loss + canvas removal.
- Task 3: `features/player` `AudioPlayer`/`AudioClock` + fast-check reference-model property (mutation-checked).
- Task 4: FastAPI app factory, `projects` context (Job aggregate, Enqueue/Get/RunJob, SQLAlchemy repo, arq queue),
  `system` context (health probes), uniform error body, Alembic `0001_jobs`, arq worker. Contracts
  `music-world.job.v1`, `job-accepted.v1`; `health.v1` now has `checks`. `POST /api/jobs/demo` is development only.
- Task 6.1: `infra/docker-compose.yml`, `infra/docker/{api,web}.Dockerfile`, `infra/Caddyfile`, `infra/.env.example`,
  root `.dockerignore`. The api container runs migrations before uvicorn.
- Roadmap 1.7: `apps/web/src/engine/__fixtures__/demo-analysis.json` (57 notes, 8 chords, 92 BPM, A minor, no lyrics)
  + invariant test. Committed as `03-world-engine-core` work.
- Tooling: `schemas-check` now hashes generated files before/after `make schemas` (catches untracked drift);
  `pnpm -C apps/web …` replaces `pnpm --dir apps/web vitest` (broken with pnpm 10) in Makefile, testing.md, skill, hook.
- Rule added (user request): no Claude/AI attribution in commits, PRs or comments.

## 3. Next actions

Plan, priorities and dates: `docs/roadmap.md` (read only the current phase).

1. **Human** — `git push origin main` (7+ local commits). Roadmap Phase 0: Kiro credits request (before
   **2026-12-01 12:00 PT**), OVHcloud instance, keys, demo song.
2. **Human + agent** — roadmap 1.6 / `01-foundation` task 7: Muse Voice on a 30 s sung vocal, Bedrock access
   (needs `META_API_KEY`, AWS credentials).
3. Roadmap 2 (`world-builder`) — `03-world-engine-core` task 1.1 — `design.md` § Engine. Fixture ready at
   `apps/web/src/engine/__fixtures__/demo-analysis.json`.
4. Roadmap 3 (`audio-analyst`) — `02-music-analysis` task 1 (schemas) — `design.md` § Data model; then switch the
   fixture test to the generated `AnalysisResultSchema` (TODO in the test).
5. Later: `01-foundation` 6.2 (S3 smoke test) and 6.3 (deploy + Quest check) once OVHcloud credentials exist.

## 4. Task ownership

| Task | Owner | Status | Note |
|---|---|---|---|
| 01-foundation 1–5, 6.1 | Claude Code | done | committed, not pushed |
| 01-foundation 6.2, 6.3 | — | todo | needs OVHcloud instance + bucket |
| 01-foundation 7 | — | blocked | needs API keys (human) |
| 02-music-analysis 1–10 | audio-analyst | todo | can start now (01 task 4 done) |
| 03-world-engine-core 1–7 | world-builder | todo | can start now; fixture ready |
| 05-ai-world-director | ai-director | todo | generate design.md + tasks.md with Kiro first |

## 5. Active pitfalls

- IWSDK 1.1.0: never run two `World.create` at once (one never resolves) — use `createMusicWorld` (queued).
- IWSDK enables its dev MCP runtime when `import.meta.env` is undefined (always in Next): it only sets
  `window.FRAMEWORK_MCP_RUNTIME`, no network. Harmless; revisit if IWSDK adds a flag.
- Desktop Chrome exposes an empty native `navigator.xr`: IWER must be force-installed in dev (handled).
- Next 16 auto-writes `apps/web/AGENTS.md` on `next dev`; disabled with `agentRules: false` — keep it off.
- Do not add a `packageManager` field to `package.json` (corepack download times out here).
- `three` must stay aliased to the super-three version IWSDK depends on; bump both together.
- Generated TS (`templates/generated`) and `packages/schemas` are produced by `make schemas` — never edit by hand.
- Meta Model API is in preview: re-verify model ids and the Muse Voice request format before coding.
- Deadline: Kiroween submission **2026-12-04 14:00 PT**; demo audio must be royalty-free.

## 6. Open specs

| Spec | Status | Next task | Section to read |
|---|---|---|---|
| 01-foundation | 1–5, 6.1 done | 6.2 / 7 (blocked on credentials) | design.md § Infra |
| 02-music-analysis | not started | 1 | design.md § Data model |
| 03-world-engine-core | fixture ready | 1.1 | design.md § Engine |
| 05-ai-world-director | requirements only | create design + tasks | requirements.md |
| 04-default-template, 06-template-store, 07-xr-mode | to create with Kiro | — | PROJECT.md §2, §8, §7 |
