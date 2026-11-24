# Handoff

> **Date:** 2026-11-25 · **Last updated by:** Claude Code (`world-builder`, roadmap Phase 7 — XR mode)
> **Format:** 6 fixed sections, **150 lines max**, rewritten at each handoff (see `.kiro/steering/handoff.md`).
> Previous sessions: `docs/handoff-archive/<YYYY-MM>.md` (not read by default).

Resume line for a new session or agent:

```text
Read docs/handoff.md and continue with the next actions.
```

## 1. Repository state

- Phase 7 worked on branch `phase-7-xr-mode` (one commit per `07-xr-mode` task, `fdfbb68` … + this handoff), merged
  into `main` through the PR "Phase 7: XR mode". Work from `main` (or a new phase branch).
  Push with gh credentials: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin <branch>`.
- Uncommitted: none.
- `make check` green: API pytest 159 passed (3 slow deselected) · web vitest 140 passed (24 files) · ruff, mypy
  strict, eslint, tsc clean · schema drift check ok · architecture check ok.
- IWER check: `MW_ANGLE=vulkan node apps/web/scripts/xr-check.mjs` against `next dev -p 3125` → 27/27 (SwiftShader:
  21/21, panel clicks skipped). Dev server stopped.
- A `music-world` Compose stack and another project's containers (`angaly_*`, postgres on 5432) may be running —
  not started by these sessions; leave them alone.

## 2. Last session (2026-11-25, Claude Code as `world-builder`)

- Created spec `07-xr-mode` (requirements, design, tasks); tasks 1–6 done, task 7 (Quest 3) is human.
- Enter / Exit VR (2D button follows `world.visibilityState`), hand tracking optional; on session start the diorama
  anchor is placed 1.3 m ahead of the head at 0.85 m, facing the user (`xr/xr-placement.ts`); restored on exit.
- Controllers: A/X play-pause, thumbstick ±5 s, grip recenter (`xr/xr-input-map.ts`, `XRControlSystem`).
- Spatial panel: `public/ui/xr-panel.uikitml` parsed at runtime by IWSDK `PanelUI`; play, restart, ±10 s, time +
  progress, template picker (`BUILTIN_TEMPLATES`, one template for now), recenter, Exit VR; hidden on the desktop.
- Left-hand pinch toggles play (strength 0.75 press / 0.6 release, `xr/pinch.ts`), not while the panel is hovered.
- **Deviation**: player commands go through `WorldHandle.setControls` (`WorldView` prop `controls`), not `WorldScene`.
- Multiview: window shader checked by recompiling all programs with super-three's multiview rewrite (`OVR_multiview2`).
- Steady state: paused frames allocate nothing and upload no instance buffer (clock, staff, fx, panel).
- Numbers and Quest steps: `.kiro/specs/07-xr-mode/design.md` § Performance, § Human checks (46 draw calls both eyes,
  ≈ 6.2 ms stereo frame on a GTX 960M in IWER).

## 3. Next actions

Plan, priorities and dates: `docs/roadmap.md` (read only the current phase).

1. **Human** — roadmap Phase 0: Kiro credits request (before **2026-12-01 12:00 PT**), OVHcloud instance + bucket,
   `META_API_KEY`, and the final royalty-free demo song. With a new demo song: put the MP3 in
   `apps/web/public/demo/`, run `cd apps/api && uv run python scripts/analyze_file.py <mp3> <json>`, replace
   `features/player/demo/neon-nocturne.analysis.json` (+ title/url in `demo-song.ts`); `test_demo_fixture.py`
   checks the hash. Re-check the default look with it (spike colors follow its pitch range).
2. **Human** — `07-xr-mode` task 7 on a Quest 3: steps in `design.md` § Human checks (fps ≥ 72, multiview windows,
   pinch, glyphs at 1 m); then tick `03-world-engine-core` task 7.
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
| 03-world-engine-core 7 | — | blocked | needs a Quest 3 (human); IWER check done (07-xr-mode design.md) |
| 04-default-template 1–5 | Claude Code (world-builder) | done | merged with Phase 4 PR |
| 07-xr-mode 1–6 | Claude Code (world-builder) | done | merged with Phase 7 PR |
| 07-xr-mode 7 | — | blocked | Quest 3 check (human) |
| 05-ai-world-director 1–6 | Claude Code (ai-director) | in progress | branch `phase-5-ai-director` |

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
- IWER: while a session runs its layer covers the page (2D buttons not clickable; use the panel). Panel clicks need
  pointerdown → pointerup within 300 ms: run `xr-check.mjs` with `MW_ANGLE=vulkan` (SwiftShader is too slow).
- Dev-only globals `window.__mwWorld` / `__mwXRDevice` are read by `xr-check.mjs`; keep them development-only.
- Panel text uses the bundled MSDF Inter font: no U+2212 minus or other missing glyphs (rendered as boxes).
- Template picker lists `BUILTIN_TEMPLATES` (`templates/default/index.ts`): add store templates there or pass them
  to `useTemplateChoice` when `06-template-store` lands.
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
| 06-template-store | to create with Kiro | — | PROJECT.md §8 |
| 07-xr-mode | 1–6 done | 7 (Quest, human) | design.md § Human checks |
