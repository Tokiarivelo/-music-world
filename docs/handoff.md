# Handoff

> **Date:** 2026-11-24 · **Last updated by:** Claude Code (roadmap Phase 9 — submission docs)
> **Format:** 6 fixed sections, **150 lines max**, rewritten at each handoff (see `.kiro/steering/handoff.md`).
> Previous sessions: `docs/handoff-archive/<YYYY-MM>.md` (not read by default).

Resume line for a new session or agent:

```text
Read docs/handoff.md and continue with the next actions.
```

## 1. Repository state

- Phase 9 docs worked on branch `phase-9-submission` (one commit per roadmap task: 9.1, 9.2, 9.3–9.5 drafts, + this
  handoff), merged into `main` through the PR "Phase 9: submission docs". Work from `main`.
  Push with gh credentials: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin <branch>`.
- Uncommitted: none.
- `make check` green (exit 0): API pytest 313 passed (3 slow deselected), web vitest 177 passed (40 files), ruff,
  mypy strict, eslint, tsc, schema drift and architecture checks clean. Docs-only session: no code changed.
- No server left running. A `music-world` Compose stack (old images, predates Phase 6) and another project's
  containers (`angaly_*`) may be running — not started by these sessions; leave them alone.
- **Nothing is deployed**: no OVHcloud instance, domain, bucket or `infra/.env` exists yet. The repo is public.

## 2. Last session (2026-11-24, Claude Code, roadmap Phase 9 agent part)

- 9.1 `README.md` rewritten for judges: "Test it in 2 minutes" (public URL marked `TODO(deploy)`), local run
  (`pnpm -C apps/web dev` web-only, `make dev` full stack), feature table, architecture diagram, configuration,
  Kiro section, known limitations, MIT + third-party licenses (Bravura OFL, IWSDK/IWER, Demucs, Basic Pitch, LGPL
  transitive `soxr`/`lameenc`). Every command checked against the Makefile and package scripts.
- 9.2 `KIRO_USAGE.md` final write-up on top of the dated log: specs table (how each was created, 62 tasks done /
  11 open), steering, 9 hooks (honest note: none fired, sessions ran outside the Kiro IDE), 4 agents, 11 skills,
  PBT findings (3 real bugs, mutation-check table), MCP (not exercised; APIs checked in installed typings), spec vs
  vibe (Phase 8 had no spec), what worked / did not.
- 9.3–9.5: `docs/submission.md` = human drafts: video shot list/script (~2:40, demo song only), Devpost description
  (Frankenstein), social post starting with `#KiroweenHackathon26`, blog outline. Placeholders `TODO(deploy)`,
  `TODO(YouTube URL)`.
- Not run (needs network to advisory DBs): `uvx pip-audit`, `pnpm audit --prod` — do it once before submission.

## 3. Next actions

Plan, priorities and dates: `docs/roadmap.md` (read only the current phase). Submission deadline **2026-12-04 14:00 PT**.

1. **Human** — roadmap Phase 0: Kiro credits request (before **2026-12-01 12:00 PT**), OVHcloud instance + bucket,
   `META_API_KEY`, AWS Bedrock access. A new demo song is optional: put the MP3 in `apps/web/public/demo/`, run
   `cd apps/api && uv run python scripts/analyze_file.py <mp3> <json>`, replace
   `features/player/demo/neon-nocturne.analysis.json` (+ title/url in `demo-song.ts`) **and `DEMO_AUDIO_HASH` in
   `apps/api/music_world/director/domain/demo.py`**; tests check both hashes.
2. **Human** — roadmap 8.1–8.3 deploy, exact steps in `infra/README.md` § Deploy (`DRY_RUN=1` first, then
   `DEPLOY_HOST=ubuntu@<ip> DEPLOY_DOMAIN=<domain> make deploy`), verify per skill `deploy-ovh` § Verify incl. Quest
   Browser Enter VR, install the cron file, run one backup. Then replace `TODO(deploy)` in `README.md` and
   `docs/submission.md` with the public URL.
3. **Human** — checks on the public URL: `06-template-store` task 7 (real e-mail, cross-user), `05-ai-world-director`
   task 7 (real Muse / Bedrock; if Muse rejects `response_format` json_schema, drop it in `providers/muse.py`),
   `07-xr-mode` task 7 on a Quest 3 (`07-xr-mode/design.md` § Human checks) then tick `03-world-engine-core` task 7.
   Update README § Known limitations once done.
4. **Human** — roadmap 9.3 video, 9.4 Devpost form, 9.5 posts from the drafts in `docs/submission.md` (checklist at
   its top). Run `uvx pip-audit` / `pnpm audit --prod` once before submitting.
5. Optional: `05-ai-world-director` task 6 (ShapeRecipe, P2); a template editor; review UI for hidden templates;
   `02-music-analysis` 6.1 (Muse Voice); `01-foundation` 6.2/6.3/7.

## 4. Task ownership

| Task | Owner | Status | Note |
|---|---|---|---|
| 01-foundation 1–5, 6.1 | Claude Code | done | merged |
| 01-foundation 6.2, 6.3 | — | blocked | needs OVHcloud instance + bucket; `deploy.sh` ready (Phase 8) |
| 01-foundation 7 | — | blocked | needs API keys (human) |
| 02-music-analysis 1–5, 6.2, 7–10 | Claude Code (audio-analyst) | done | merged with Phase 3 PR |
| 02-music-analysis 6.1 | — | blocked | Muse Voice: needs `META_API_KEY` + format check (P2) |
| 03-world-engine-core 1–6 | Claude Code (world-builder) | done | task 6 with Phase 4 PR |
| 03-world-engine-core 7 | — | blocked | needs a Quest 3 (human); IWER check done (07-xr-mode design.md) |
| 04-default-template 1–5 | Claude Code (world-builder) | done | merged with Phase 4 PR |
| 07-xr-mode 1–6 | Claude Code (world-builder) | done | merged with Phase 7 PR |
| 07-xr-mode 7 | — | blocked | Quest 3 check (human) |
| 05-ai-world-director 1–5 | Claude Code (ai-director) | done | merged with Phase 5 PR |
| 05-ai-world-director 6 | — | todo | ShapeRecipe (P2), skipped |
| 05-ai-world-director 7 | — | blocked | real calls need `META_API_KEY` / AWS credentials (human) |
| 06-template-store 1–6 | Claude Code | done | merged with Phase 6 PR |
| 06-template-store 7 | — | blocked | real e-mail (SMTP credentials) + public URL (human) |
| Roadmap 8.4, 8.5 | Claude Code (deploy/hardening) | done | `docs/security-review.md`, `infra/README.md` |
| Roadmap 8.1–8.3 | — | blocked | scripts + runbook ready; needs instance, domain, keys (human) |
| Roadmap 9.1, 9.2 | Claude Code (submission docs) | done | `README.md`, `KIRO_USAGE.md` |
| Roadmap 9.3–9.5 | — | blocked | human: video, Devpost, posts; drafts in `docs/submission.md` |

## 5. Active pitfalls

- `basic-pitch` 0.4.0 requires TensorFlow < 2.15.1 (no Python 3.12 wheels): `apps/api/pyproject.toml`
  `override-dependencies` removes it and runs the bundled ONNX model. Do not "fix" that override.
- torch / torchaudio must come from the PyTorch CPU index (`[tool.uv.sources]`); a plain PyPI torch pulls ~3 GB of
  CUDA. Disk on this laptop is ~98 % full: watch `df -h` before adding models or images.
- Never import analysis infrastructure (torch, librosa) at module level in code the API process loads.
- `.gitignore` ignores audio except `apps/api/tests/fixtures/*.{wav,mp3,flac}` and `apps/web/public/demo/*.mp3`.
- Next's route announcer is an empty `role="alert"`: in browser tests select `p[role=alert]`.
- IWSDK 1.1.0: never run two `World.create` at once — use `createMusicWorld` (queued). Its canvas follows the
  window: 2D controls must be absolutely positioned above it.
- Next 16 auto-writes `apps/web/AGENTS.md` on `next dev`; disabled with `agentRules: false` — keep it off.
- Do not add a `packageManager` field to `package.json` (corepack download times out here).
- `three` must stay aliased to the super-three version IWSDK depends on; bump both together.
- Colors are linear in three.js: use `lightness()` (`xr/palette.ts`) for perceived brightness factors.
- `bravura-outlines.ts` is generated: rerun `scripts/extract_bravura_glyphs.py`, never edit by hand.
- Generated TS (`templates/generated`) and `packages/schemas` come from `make schemas` — never edit by hand.
  zod does not re-check pydantic `model_validator`s (analysis invariants, zone bounds).
- No repo Prettier config: format with `npx prettier --print-width 120 --single-quote` on the files you touch only.
- Playwright: `executablePath` `~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, `--use-angle=vulkan` to
  see the world. A scratch script must import `playwright-core` by absolute path (`apps/web/node_modules/...`).
- IWER: panel clicks need `MW_ANGLE=vulkan` for `xr-check.mjs`. Dev-only globals `window.__mwWorld` /
  `__mwXRDevice` are read by it; keep them development-only. The VR panel has only 4 template slots.
- Panel text uses the bundled MSDF Inter font: no U+2212 minus or other missing glyphs (rendered as boxes).
- Do not `pkill -f "<pattern>"` from the agent shell: it kills the shell itself; keep PIDs.
- Local API without Docker: `DATABASE_URL=sqlite+aiosqlite:///<file> uv run alembic upgrade head` then uvicorn;
  `next dev` with `DEV_API_URL`. Sign-in links appear in the api log (`auth.sign_in_link`, console sender).
- Auth: every web call with a body goes through `apiFetch` (`src/lib/api-client.ts`), or signed-in users get
  `403 CSRF_FAILED`. Tests use `base_url="https://test"` so the `Secure` cookies are sent.
- Rate limits (director, sign-in, publish, upload) are in memory per uvicorn worker (2 workers → up to 2×).
- Director: change any prompt → bump `PROMPT_VERSION`; mock output changes → bump `MOCK_MODEL`.
  `director/infrastructure/default_template.json` must equal the web `neon-nocturne.json` (test).
- `anthropic` 2.x uses `httpx2`: mock its transport with `httpx2.MockTransport`.
- Muse and Bedrock adapters, and the SMTP sender, were never run against live services (no credentials).
- Body limits live in two places (`main.py` `path_limits` and the Caddyfile): a new upload route needs both.
- New external origin in the web app (CDN, presigned S3 URLs) → extend the Caddy CSP, or it is blocked silently.
- Production `create_app` raises on `SESSION_COOKIE_SECURE=false` / `http://` `PUBLIC_BASE_URL`: tests that build a
  production app must pass an https `public_base_url`.
- Never `docker volume prune` on the server (pgdata, storage, Let's Encrypt certificates).
- Deadline: Kiroween submission **2026-12-04 14:00 PT**; demo audio must be royalty-free.

## 6. Open specs

| Spec | Status | Next task | Section to read |
|---|---|---|---|
| 01-foundation | 1–5, 6.1 done | 6.2 / 7 (blocked on credentials) | design.md § Infra |
| 02-music-analysis | 1–5, 6.2, 7–10 done | 6.1 (P2, blocked on key) | design.md § As built (Phase 3) |
| 03-world-engine-core | 1–6 done | 7 (Quest) | design.md § Rendering "As built" |
| 04-default-template | 1–5 done | — (polish P2) | design.md § As built (Phase 4) |
| 05-ai-world-director | 1–5 done | 7 (human real calls), 6 (P2) | design.md § Human checks, § As built |
| 06-template-store | 1–6 done | 7 (human: real e-mail, public URL) | design.md § Human checks, § As built |
| 07-xr-mode | 1–6 done | 7 (Quest, human) | design.md § Human checks |
