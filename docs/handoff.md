# Handoff

> **Date:** 2026-11-23 · **Last updated by:** Claude Code (01-foundation tasks 1 + 5)
> **Format:** 6 fixed sections, **150 lines max**, rewritten at each handoff (see `.kiro/steering/handoff.md`).
> Previous sessions: `docs/handoff-archive/<YYYY-MM>.md` (not read by default).

Resume line for a new session or agent:

```text
Read docs/handoff.md and continue with the next actions.
```

## 1. Repository state

- Branch `main`, last commit `19e7902` (project design). **All work below is uncommitted** (commit only on request).
- Uncommitted: `Makefile`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/api/` (pyproject, uv.lock,
  `music_world/schemas`, `scripts/export_schemas.py`, tests), `packages/schemas/`, `apps/web/src/templates/generated/`,
  `infra/README.md`, `docs/roadmap.md`, `docs/handoff-archive/2026-11.md`; modified `rules.md`, `README.md`,
  `PROJECT.md`, `tasks.md`, `KIRO_USAGE.md`.
- Tests: `make check` green — pytest 3 passed, ruff + format + mypy strict clean, architecture check ok.
- No services running. Tooling: uv (Python 3.12 managed by uv; system python is 3.10), pnpm 10.29, Node 24.

## 2. Last session (2026-11-23, Claude Code)

- Done `01-foundation` task 1: dirs `apps/{web,api}`, `packages/schemas`, `infra`; root `Makefile` with
  `help dev test check schemas schemas-check build deploy logs`. `LICENSE` (MIT) and `.gitignore` already existed.
- `dev`, `build`, `deploy` fail with a clear message until task 6 creates compose/deploy files.
- Done task 5: pydantic models registered in `music_world.schemas.EXPORTED` (id → model);
  `apps/api/scripts/export_schemas.py` → `packages/schemas/<name>.vN.schema.json` (`$id`, GENERATED `$comment`);
  `packages/schemas/scripts/generate-ts.mjs` (json-schema-to-zod 2.8.1, ISC) → `apps/web/src/templates/generated/
  <name>-vN.ts` exporting `XSchema`, `type X`, `XSchemaId`, plus `index.ts`.
- First contract: `music-world.health.v1` (`status: ok|degraded`, `version`) — for `/api/health` in task 4.1.
- `make check` = schemas-check (git diff of generated files) + tests + ruff + mypy + web lint/typecheck (when web
  exists) + architecture script.
- `apps/api/pyproject.toml` is a minimal uv project (pydantic only); task 4.1 adds FastAPI, settings, etc.
- New absolute rule in `rules.md` (user request): no Claude / AI attribution in commits, PRs or comments.

## 3. Next actions

Plan, priorities and dates: `docs/roadmap.md` (read only the current phase).

1. **Human** — roadmap Phase 0: Kiro credits request (before **2026-12-01 12:00 PT**), OVHcloud instance, keys, demo song.
2. Roadmap 1.2 — `01-foundation` task 2 — `design.md` § Components › Web; verify IWSDK API in official docs.
   Scaffold Next.js into `apps/web` without deleting `src/templates/generated/`; add `zod` as a web dependency.
3. Roadmap 1.4 — `01-foundation` task 4 — extend `apps/api/pyproject.toml`; `/health` returns `Health` schema.
4. Roadmap 1.6 — `01-foundation` task 7 — day-1 risk checks (Muse Voice on sung vocals, Bedrock access).
5. Roadmap 1.7 — engine fixture, then phases 2 (`world-builder`) and 3 (`audio-analyst`) in parallel.

## 4. Task ownership

| Task | Owner | Status | Note |
|---|---|---|---|
| 01-foundation 1, 5 | Claude Code | done | uncommitted |
| 01-foundation 2–4, 6–7 | — | todo | |
| 02-music-analysis 1–10 | audio-analyst | todo | starts after 01 task 4 |
| 03-world-engine-core 1–7 | world-builder | todo | engine tasks 1–2 can start after 01 task 2 |
| 05-ai-world-director | ai-director | todo | generate design.md + tasks.md with Kiro first |

## 5. Active pitfalls

- IWSDK officially documents Vite only: in Next.js, no `virtual:iwsdk-project`, no auto IWER, no scene editor.
  Fallback: separate Vite app under `/world` (01 requirement 2.5).
- Meta Model API is in preview: re-verify model ids and the Muse Voice request format before coding.
- Do not add a `packageManager` field to `package.json`: corepack then tries to download pnpm and times out here.
- `schemas-check` uses `git diff`, so it only detects drift once generated files are committed (untracked = pass).
- Generated TS imports `zod`; it compiles only once `apps/web` depends on zod (task 2.1).
- Hook file format was checked against the installed Kiro 1.5.11; if a hook does not show in the Hooks panel,
  recreate it from the UI with the same prompt.
- Deadline: Kiroween submission **2026-12-04 14:00 PT**; demo audio must be royalty-free.

## 6. Open specs

| Spec | Status | Next task | Section to read |
|---|---|---|---|
| 01-foundation | tasks 1, 5 done | 2 | design.md § Components › Web |
| 02-music-analysis | not started | 1 | design.md § Pipeline |
| 03-world-engine-core | not started | 1.1 | design.md § Engine |
| 05-ai-world-director | requirements only | create design + tasks | requirements.md |
| 04-default-template, 06-template-store, 07-xr-mode | to create with Kiro | — | PROJECT.md §2, §8, §7 |
