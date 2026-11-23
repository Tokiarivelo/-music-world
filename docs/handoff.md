# Handoff

> **Date:** 2026-11-24 · **Last updated by:** Claude Code (`world-builder`, roadmap Phase 4 — default look)
> **Format:** 6 fixed sections, **150 lines max**, rewritten at each handoff (see `.kiro/steering/handoff.md`).
> Previous sessions: `docs/handoff-archive/<YYYY-MM>.md` (not read by default).

Resume line for a new session or agent:

```text
Read docs/handoff.md and continue with the next actions.
```

## 1. Repository state

- Phase 4 worked on branch `phase-4-default-look` (one commit per `04-default-template` task, `83e471c` … + this
  handoff), merged into `main` through the PR "Phase 4: default look". Work from `main` (or a new phase branch).
  Push with gh credentials: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin <branch>`.
- Uncommitted: none.
- `make check` green: API pytest 159 passed (3 slow deselected) · web vitest 121 passed (19 files) · ruff, mypy
  strict, eslint, tsc clean · schema drift check ok · architecture check ok.
- Verified on a production build (`pnpm -C apps/web build && pnpm -C apps/web exec next start -p 3124`, headless
  Chromium + SwiftShader, `/play/demo?perf=1`): 15–16 draw calls, ≈ 72–75 k triangles. Server stopped.
- A `music-world` Compose stack and another project's containers (`angaly_*`, postgres on 5432) may be running —
  not started by these sessions; leave them alone.

## 2. Last session (2026-11-24, Claude Code as `world-builder`)

- Created spec `04-default-template` (requirements, design, tasks) from `PROJECT.md` §2 and the `world-template`
  checklist; tasks 1–5 done. `03-world-engine-core` task 6 (side-by-side checkpoint) ticked.
- Details, measurements and the list of remaining mismatches: `.kiro/specs/04-default-template/design.md`
  § "As built (Phase 4)".
- **Deviation**: the staff path (`engine/staff.ts`) now runs near edge → far edge (not corner to corner), which is
  what the reference shows from its near-isometric camera; template zones moved with it (city left of the staff).
- Camera: azimuth 27°, elevation 31°, FOV 20°, 2.5 m (`xr/constants.ts`, `desktopCameraPose`). VR unchanged.
- Terrain: `xr/terrain-field.ts` (pure height field + crack network), baked vertex shading on unlit materials;
  ridges render as rugged dark mountains.
- **Bravura**: font + OFL license in `assets/fonts/bravura/`; `scripts/extract_bravura_glyphs.py` generates
  `xr/glyphs/bravura-outlines.ts`; glyphs are instanced `ShapeGeometry` (not SDF text — `tech.md` updated), with an
  additive halo per glyph and around the staff lines. G clefs at both ends.
- City: lit windows via `onBeforeCompile` (`xr/shapes/city-materials.ts`), equalizer needle clusters (additive);
  decor arcs aligned to the staff, round particles mostly on the arcs; no post-processing bloom.
- `?perf=1` logs `renderer.info` once per second (`PerfSystem`).

## 3. Next actions

Plan, priorities and dates: `docs/roadmap.md` (read only the current phase).

1. **Human** — roadmap Phase 0: Kiro credits request (before **2026-12-01 12:00 PT**), OVHcloud instance + bucket,
   `META_API_KEY`, and the final royalty-free demo song. With a new demo song: put the MP3 in
   `apps/web/public/demo/`, run `cd apps/api && uv run python scripts/analyze_file.py <mp3> <json>`, replace
   `features/player/demo/neon-nocturne.analysis.json` (+ title/url in `demo-song.ts`); `test_demo_fixture.py`
   checks the hash. Re-check the default look with it (spike colors follow its pitch range).
2. Roadmap 7a — Enter VR check of the diorama in IWER (skill `xr-verify`), then `03-world-engine-core` task 7 on a
   Quest 3 (human): fps, glyph readability at 1 m, window shader under multiview.
3. Roadmap 5 (`ai-director`) — `05-ai-world-director`: generate design + tasks with Kiro; the director reads
   `GET /api/projects/{id}/analysis` (contract `music-world.analysis.v1`).
4. Roadmap 8 — infra: the API image needs ffmpeg + torch CPU (~1.4 GB more); pre-download Demucs weights at image
   build (`infrastructure.md` rule, not done yet); `make build` then re-check `/upload` in Compose.
5. Optional polish (P2, `04-default-template/design.md` § remaining mismatches): beamed sixteenth groups, softer
   right-edge ridges, longer decor arcs, rim light on the right of the plate.
6. Later: `02-music-analysis` 6.1 (Muse Voice, P2, needs `META_API_KEY`), `01-foundation` 6.2/6.3/7.

## 4. Task ownership

| Task | Owner | Status | Note |
|---|---|---|---|
| 01-foundation 1–5, 6.1 | Claude Code | done | merged |
| 01-foundation 6.2, 6.3 | — | todo | needs OVHcloud instance + bucket |
| 01-foundation 7 | — | blocked | needs API keys (human) |
| 02-music-analysis 1–5, 6.2, 7–10 | Claude Code (audio-analyst) | done | merged with Phase 3 PR |
| 02-music-analysis 6.1 | — | blocked | Muse Voice: needs `META_API_KEY` + format check (P2) |
| 03-world-engine-core 1–6 | Claude Code (world-builder) | done | task 6 with Phase 4 PR |
| 03-world-engine-core 7 | — | blocked | needs a Quest 3 (human); IWER first check possible |
| 04-default-template 1–5 | Claude Code (world-builder) | done | merged with Phase 4 PR |
| 05-ai-world-director | ai-director | todo | generate design.md + tasks.md with Kiro first; contracts exist |

## 5. Active pitfalls

- `basic-pitch` 0.4.0 requires TensorFlow < 2.15.1 (no Python 3.12 wheels): `apps/api/pyproject.toml`
  `override-dependencies` removes it and runs the bundled ONNX model. Do not "fix" that override.
- torch / torchaudio must come from the PyTorch CPU index (`[tool.uv.sources]`); a plain PyPI torch pulls ~3 GB of
  CUDA. Disk on this laptop is ~97 % full: watch `df -h` before adding models or images.
- Never import analysis infrastructure (torch, librosa) at module level in code the API process loads.
- `.gitignore` ignores audio except `apps/api/tests/fixtures/*.{wav,mp3,flac}` and `apps/web/public/demo/*.mp3`.
- Next's route announcer is an empty `role="alert"`: in browser tests select `p[role=alert]`.
- IWSDK 1.1.0: never run two `World.create` at once — use `createMusicWorld` (queued). Its canvas follows the
  window: 2D controls must be absolutely positioned above it.
- Next 16 auto-writes `apps/web/AGENTS.md` on `next dev`; disabled with `agentRules: false` — keep it off.
- `next start` warns about `output: standalone` but serves fine for local checks; Docker uses the standalone server.
- Do not add a `packageManager` field to `package.json` (corepack download times out here).
- `three` must stay aliased to the super-three version IWSDK depends on; bump both together.
  `@types/three` 0.185: `ShapePath.toShapes()` takes no argument (holes are detected automatically).
- Colors are linear in three.js: `Color.lerp` toward a bright palette color dominates fast (a 0.1 mix is strong);
  use `lightness()` (`xr/palette.ts`) for perceived brightness factors.
- Desktop camera tuning: the reference is near-orthographic; change azimuth/elevation/FOV in `xr/constants.ts` and
  check a production screenshot — `next dev` HMR does not rebuild the world camera reliably.
- `bravura-outlines.ts` is generated: rerun `scripts/extract_bravura_glyphs.py`, never edit by hand.
- Generated TS (`templates/generated`) and `packages/schemas` come from `make schemas` — never edit by hand.
  zod does not re-check pydantic `model_validator`s (analysis invariants, zone bounds).
- No repo Prettier config: format with `npx prettier --print-width 120 --single-quote` on the files you touch only.
- Playwright: use `executablePath` `~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` with
  `--use-angle=swiftshader`; seek a paused `/play/demo` by filling `input[type=range]`.
- Do not `pkill -f "<pattern>"` from the agent shell: the pattern matches the shell itself and kills it; keep PIDs.
- No auth yet: project routes are public (accounts context missing); no upload rate limit.
- Deadline: Kiroween submission **2026-12-04 14:00 PT**; demo audio must be royalty-free.

## 6. Open specs

| Spec | Status | Next task | Section to read |
|---|---|---|---|
| 01-foundation | 1–5, 6.1 done | 6.2 / 7 (blocked on credentials) | design.md § Infra |
| 02-music-analysis | 1–5, 6.2, 7–10 done | 6.1 (P2, blocked on key) | design.md § As built (Phase 3) |
| 03-world-engine-core | 1–6 done | 7 (Quest) | design.md § Rendering "As built" |
| 04-default-template | 1–5 done | — (polish P2) | design.md § As built (Phase 4) |
| 05-ai-world-director | requirements only | create design + tasks | requirements.md |
| 06-template-store, 07-xr-mode | to create with Kiro | — | PROJECT.md §8, §7 |
