# Handoff

> **Date:** 2026-11-23 · **Last updated by:** Claude Code (`audio-analyst`, roadmap Phase 3 — music analysis)
> **Format:** 6 fixed sections, **150 lines max**, rewritten at each handoff (see `.kiro/steering/handoff.md`).
> Previous sessions: `docs/handoff-archive/<YYYY-MM>.md` (not read by default).

Resume line for a new session or agent:

```text
Read docs/handoff.md and continue with the next actions.
```

## 1. Repository state

- Phase 3 worked on branch `phase-3-music-analysis` (one commit per spec task, `988a068` … + this handoff), merged
  into `main` through the PR "Phase 3: music analysis". Work from `main` (or a new phase branch).
  Push with gh credentials: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin <branch>`.
- Uncommitted: none.
- `make check` green: API pytest 159 passed (3 slow deselected) · web vitest 108 passed (18 files) · ruff, mypy
  strict, eslint, tsc clean · schema drift check ok · architecture check ok.
  Slow tests (real Demucs / Basic Pitch / librosa, ~70 s): `cd apps/api && uv run pytest -m slow` → 3 passed.
- Verified live (API + arq worker + redis in Docker + SQLite + local storage, `pnpm dev`, headless Chromium):
  `/upload` → per-stage progress → redirect to `/play/<id>` after 44 s → the world plays the uploaded audio.
  All verification processes stopped. A `music-world` Compose stack (caddy, web, api, worker, postgres, redis) was
  already running when this session started (not started by this session; left untouched — its images predate
  Phase 3, rebuild before using it).
- Another project's containers (`angaly_*`, postgres on 5432) — leave them alone.

## 2. Last session (2026-11-23, Claude Code as `audio-analyst`)

- `02-music-analysis` tasks 1–5, 6.2, 7–10 done; 6.1 (Muse Voice) skipped. Details and measurements:
  `.kiro/specs/02-music-analysis/design.md` § "As built (Phase 3)". ADR `docs/decisions/001-analysis-ml-stack.md`.
- Contracts: `music-world.analysis.v1` (validator enforces requirement 7.2), `project.v1`, `project-created.v1`.
  The engine's `EngineAnalysis` is now a `Pick` of the generated `Analysis`; the engine fixture is zod-parsed.
- API: `POST /api/projects` (multipart, sniffing, limits, SHA-256 cache, enqueue `analyze_project`),
  `GET /api/projects/{id}`, `/analysis` (409 until ready; user `.lrc` applied here), `/audio`. Migration
  `0002_projects_analyses` (projects, analyses JSON rows, `jobs.subject_id`).
- Worker: `AnalyzeAudio` pipeline decode → Demucs (`shifts=0`, deterministic) → Basic Pitch (ONNX, no TensorFlow)
  → librosa rhythm/structure → chords/key → lyrics (none) → validate → store; resumable checkpoints in object
  storage. `build_container(settings, with_analysis=True)` only in the worker (torch/librosa never load in the API).
- **Measured** (4-core i7-4750HQ laptop): 3-minute song **392.7 s wall / 748.5 s CPU** (Demucs 351 s, 89 %),
  Demucs peak RSS 2.0 GB; 10 s fixture 29.6 s. Worker `max_jobs` = cores / 4.
- Storage: no OVHcloud bucket yet → `LocalObjectStore(STORAGE_DIR)` (Compose volume `storage`); `S3ObjectStore`
  is used automatically once the `S3_*` settings are complete (untested against a real bucket).
- Web: `features/upload` + `/upload` page; `/play/[projectId]` (`ProjectPlayback`). `/play/demo` now plays the
  pre-analysed demo song "Neon Nocturne" (self-made with `scripts/synth_song.py --demo`, MP3 in
  `apps/web/public/demo/`, analysis JSON in `features/player/demo/`), falling back to in-browser synthesis.
- Property tests found 2 real bugs (duplicate notes losing the loudest; float rounding dropping the last note) and
  one weak test strategy; mutation checks: 18 mutants, 1 equivalent survivor (`KIRO_USAGE.md`).

## 3. Next actions

Plan, priorities and dates: `docs/roadmap.md` (read only the current phase).

1. **Human** — roadmap Phase 0: Kiro credits request (before **2026-12-01 12:00 PT**), OVHcloud instance + bucket,
   `META_API_KEY`, and the final royalty-free demo song. With a new demo song: put the MP3 in
   `apps/web/public/demo/`, run `cd apps/api && uv run python scripts/analyze_file.py <mp3> <json>`, replace
   `features/player/demo/neon-nocturne.analysis.json` (+ title/url in `demo-song.ts`); `test_demo_fixture.py`
   checks the hash.
2. Roadmap 4 (`world-builder`) — create `04-default-template` spec with Kiro, then `03-world-engine-core` task 6
   (side-by-side screenshot vs `assets/reference-image-original.png`). Use `/play/demo` (real analysis now).
   Files: `xr/constants.ts`, `xr/views/*`, `templates/default/neon-nocturne.json`. Skill `world-template`.
3. Roadmap 7a — Enter VR check of the diorama in IWER, then `03-world-engine-core` task 7 on a Quest 3 (human).
4. Roadmap 5 (`ai-director`) — `05-ai-world-director`: generate design + tasks with Kiro; the director reads
   `GET /api/projects/{id}/analysis` (contract `music-world.analysis.v1`).
5. Roadmap 8 — infra: the API image now needs ffmpeg + torch CPU (~1.4 GB more); pre-download Demucs weights at
   image build (`infrastructure.md` rule, not done yet); `make build` then re-check `/upload` in Compose.
6. Later: `02-music-analysis` 6.1 (Muse Voice, P2, needs `META_API_KEY`), `01-foundation` 6.2/6.3/7.

## 4. Task ownership

| Task | Owner | Status | Note |
|---|---|---|---|
| 01-foundation 1–5, 6.1 | Claude Code | done | merged |
| 01-foundation 6.2, 6.3 | — | todo | needs OVHcloud instance + bucket |
| 01-foundation 7 | — | blocked | needs API keys (human) |
| 02-music-analysis 1–5, 6.2, 7–10 | Claude Code (audio-analyst) | done | merged with Phase 3 PR |
| 02-music-analysis 6.1 | — | blocked | Muse Voice: needs `META_API_KEY` + format check (P2) |
| 03-world-engine-core 1–5 | Claude Code (world-builder) | done | merged with Phase 2 PR |
| 03-world-engine-core 6 | world-builder | todo | Phase 4 (default look checkpoint) |
| 03-world-engine-core 7 | — | blocked | needs a Quest 3 (human); IWER first check possible |
| 05-ai-world-director | ai-director | todo | generate design.md + tasks.md with Kiro first; contracts exist |

## 5. Active pitfalls

- `basic-pitch` 0.4.0 requires TensorFlow < 2.15.1 (no Python 3.12 wheels): `apps/api/pyproject.toml`
  `override-dependencies` removes it and runs the bundled ONNX model. Do not "fix" that override.
- torch / torchaudio must come from the PyTorch CPU index (`[tool.uv.sources]`); a plain PyPI torch pulls ~3 GB of
  CUDA. Disk on this laptop is ~96 % full: watch `df -h` before adding models or images.
- Never import analysis infrastructure (torch, librosa) at module level in code the API process loads: the
  container imports them lazily in `_analysis_handler` (worker only).
- librosa may lock onto eighth notes (200 BPM for a 100 BPM song); beats stay on the grid.
- On a perfectly looping synthetic song every section has the same cluster → all labelled `chorus`.
- `.gitignore` ignores audio except `apps/api/tests/fixtures/*.{wav,mp3,flac}` and `apps/web/public/demo/*.mp3`.
- Next's route announcer is an empty `role="alert"`: in browser tests select `p[role=alert]`.
- IWSDK 1.1.0: never run two `World.create` at once — use `createMusicWorld` (queued). Its canvas follows the
  window: 2D controls must be absolutely positioned above it.
- Next 16 auto-writes `apps/web/AGENTS.md` on `next dev`; disabled with `agentRules: false` — keep it off.
- Do not add a `packageManager` field to `package.json` (corepack download times out here).
- `three` must stay aliased to the super-three version IWSDK depends on; bump both together.
- Generated TS (`templates/generated`) and `packages/schemas` come from `make schemas` — never edit by hand.
  zod does not re-check pydantic `model_validator`s (analysis invariants, zone bounds).
- No repo Prettier config: format with `npx prettier --print-width 120 --single-quote` on the files you touch only.
- Playwright: use `executablePath` `~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` with
  `--use-angle=swiftshader`.
- No auth yet: project routes are public (accounts context missing); no upload rate limit.
- Deadline: Kiroween submission **2026-12-04 14:00 PT**; demo audio must be royalty-free.

## 6. Open specs

| Spec | Status | Next task | Section to read |
|---|---|---|---|
| 01-foundation | 1–5, 6.1 done | 6.2 / 7 (blocked on credentials) | design.md § Infra |
| 02-music-analysis | 1–5, 6.2, 7–10 done | 6.1 (P2, blocked on key) | design.md § As built (Phase 3) |
| 03-world-engine-core | 1–5 done | 6 (Phase 4), 7 (Quest) | design.md § Rendering "As built" |
| 05-ai-world-director | requirements only | create design + tasks | requirements.md |
| 04-default-template, 06-template-store, 07-xr-mode | to create with Kiro | — | PROJECT.md §2, §8, §7 |
