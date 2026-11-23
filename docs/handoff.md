# Handoff

> **Date:** 2026-11-23 · **Last updated by:** Claude Code (03-world-engine-core 1.1 prng)
> **Format:** 6 fixed sections, **150 lines max**, rewritten at each handoff (see `.kiro/steering/handoff.md`).
> Previous sessions: `docs/handoff-archive/<YYYY-MM>.md` (not read by default).

Resume line for a new session or agent:

```text
Read docs/handoff.md and continue with the next actions.
```

## 1. Repository state

- Branch `main`, one commit per task (`722de54` … `a133fd7` + handoff), pushed to `origin/main`.
  Push with gh credentials: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin main`.
- Last commit `02bbf0e docs: handoff push state`. Uncommitted: `apps/web/src/engine/prng{,.test}.ts`,
  `03-world-engine-core/tasks.md` (1.1 ticked), `docs/handoff.md`, archive, `KIRO_USAGE.md` — commit when asked as
  `03-world-engine-core: 1.1 prng with property tests`.
- This session: `pnpm -C apps/web exec vitest run src/engine` 16 passed · `tsc` and eslint clean ·
  `scripts/agents/validate-architecture.sh` ok. Full `make check` last run green before this session.
- `make check` green: API pytest 28 passed · web vitest 14 passed · ruff, mypy strict, eslint, tsc clean ·
  schema drift check ok · architecture check ok.
- Verified live: `make dev` stack (caddy, web, api, worker, postgres, redis) all healthy; `https://localhost/api/health`
  ok; demo job queued → done through the worker; `/api/docs` blocked by Caddy; `/play/demo` renders the cube
  (prod build). Stack stopped afterwards (`docker compose down`, volumes kept). No services running.
- Another project's postgres (`angaly_postgres`) holds host port 5432 — leave it alone; our stack publishes only 80/443.

## 2. Last session (2026-11-23, Claude Code as `world-builder`)

- `03-world-engine-core` task 1.1 done: `apps/web/src/engine/prng.ts` — `hashString` (FNV-1a 32-bit),
  `hashSeed(seed, key)` (FNV + MurmurHash3 finalizer), `mulberry32`, `noteStream(seed, noteId)`, `uniform`.
- `prng.test.ts`: 12 tests (fast-check) — FNV reference values, pinned mulberry32 outputs, determinism, [0,1) range,
  uniformity, order independence of per-note streams (req 1.4), no collisions over 20 000 note ids.
- Mutation check: 3 mutants (drop `>>> 0`, ignore the seed, truncate code units to 8 bits) all killed; the third
  survived at first and led to a targeted bit-flip property (logged in `KIRO_USAGE.md`).
- No spec deviation.

## 3. Next actions

Plan, priorities and dates: `docs/roadmap.md` (read only the current phase).

1. **Human** — roadmap Phase 0: Kiro credits request (before
   **2026-12-01 12:00 PT**), OVHcloud instance, keys, demo song.
2. **Human + agent** — roadmap 1.6 / `01-foundation` task 7: Muse Voice on a 30 s sung vocal, Bedrock access
   (needs `META_API_KEY`, AWS credentials).
3. Roadmap 2 (`world-builder`) — `03-world-engine-core` task 1.2 `mapping.ts` (needs the `WorldTemplate` mapping
   rule shape: check `PROJECT.md` §8 / generated template types first) — `design.md` § Engine; then 1.3 `layout.ts`
   using `noteStream` + `uniform` from `engine/prng.ts`.
4. Roadmap 3 (`audio-analyst`) — `02-music-analysis` task 1 (schemas) — `design.md` § Data model; then switch the
   fixture test to the generated `AnalysisResultSchema` (TODO in the test).
5. Later: `01-foundation` 6.2 (S3 smoke test) and 6.3 (deploy + Quest check) once OVHcloud credentials exist.

## 4. Task ownership

| Task | Owner | Status | Note |
|---|---|---|---|
| 01-foundation 1–5, 6.1 | Claude Code | done | pushed |
| 01-foundation 6.2, 6.3 | — | todo | needs OVHcloud instance + bucket |
| 01-foundation 7 | — | blocked | needs API keys (human) |
| 02-music-analysis 1–10 | audio-analyst | todo | can start now (01 task 4 done) |
| 03-world-engine-core 1.1 | Claude Code (world-builder) | done | prng.ts, uncommitted |
| 03-world-engine-core 1.2–7 | world-builder | todo | fixture ready |
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
| 03-world-engine-core | 1.1 done | 1.2 | design.md § Engine |
| 05-ai-world-director | requirements only | create design + tasks | requirements.md |
| 04-default-template, 06-template-store, 07-xr-mode | to create with Kiro | — | PROJECT.md §2, §8, §7 |
