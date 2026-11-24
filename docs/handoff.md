# Handoff

> **Date:** 2026-11-26 · **Last updated by:** Claude Code (roadmap Phase 6 — Template store)
> **Format:** 6 fixed sections, **150 lines max**, rewritten at each handoff (see `.kiro/steering/handoff.md`).
> Previous sessions: `docs/handoff-archive/<YYYY-MM>.md` (not read by default).

Resume line for a new session or agent:

```text
Read docs/handoff.md and continue with the next actions.
```

## 1. Repository state

- Phase 6 worked on branch `phase-6-template-store` (one commit per `06-template-store` task + this handoff), merged
  into `main` through the PR "Phase 6: template store". Work from `main` (or a new phase branch).
  Push with gh credentials: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin <branch>`.
- Uncommitted: none. Commits are unsigned (GPG signing fails non-interactively).
- `make check` green (exit 0): API pytest 302 passed (3 slow deselected), web vitest 177 passed (40 files), ruff,
  mypy strict, eslint, tsc, schema drift and architecture checks clean.
- No server left running. A `music-world` Compose stack and another project's containers (`angaly_*`, postgres on
  5432) may be running — not started by these sessions; leave them alone. The Compose stack predates migrations
  `0003`/`0004`: rebuild before using it (`make build`, the api runs `alembic upgrade head` at start).

## 2. Last session (2026-11-26, Claude Code, Phase 6)

- Created spec `06-template-store` (requirements in EARS, design, tasks) from `PROJECT.md` §8; tasks 1–6 done
  (6 = P2 reports + upload limit); 7 is the human check.
- Accounts: **e-mail magic link** (no GitHub OAuth). `EmailSender` port: `console` (link logged, default) / `smtp`.
  Tokens and sessions random 256-bit, stored as SHA-256, single use (atomic `UPDATE … RETURNING`), 15 min / 30 days.
  Cookies `mw_session` (httpOnly, Secure, Lax) + `mw_csrf`; unsafe requests with a session need `X-CSRF-Token`
  (`src/lib/api-client.ts` adds it). Production also refuses cross-origin `/api/auth/*` POSTs.
- Ownership: projects uploaded signed in get `owner_id`; others get 404 on project/audio/analysis/director
  (`shared/auth.py` `AccessibleProjectId`). Anonymous uploads stay public by id (judge path needs no login).
  Director rate limit keyed by user or IP.
- Store (`apps/api/music_world/templates/`): validate (pydantic + store spec: 32 KB, built-in kinds, staff contrast,
  plain-text name), unique template id suffix, drafts/publish/delete owner-only (404), thumbnails sniffed
  (PNG/JPEG/WebP ≤ 128 KB, ≤ 640 px), public cursor-paginated gallery, featured launch templates from JSON files.
- Web: `features/auth` (`/sign-in`, `/auth/verify`), `features/template-store` (`/templates`, publish button for
  AI-generated worlds with a generated palette WebP thumbnail, report button), player picker = built-ins → `?template=`
  store template → generated → other store templates (the VR panel shows only 4 slots).
- Halloween launch template `kiroween-pumpkin-night` (store id `00000000-0000-7000-8000-000000000001`).
- Live check with Playwright (sign-in via logged link, publish, other browser uses it) and
  `MW_ANGLE=vulkan node apps/web/scripts/xr-check.mjs` 28/28 (new check: VR picker lists the store template).
  Details: `.kiro/specs/06-template-store/design.md` § As built.
- **Deviations** (in `design.md`): thumbnail is a generated palette preview, not a WebGL capture; reports have no
  review UI (restore with SQL); `RateLimitedError` moved to `shared/errors.py`.

## 3. Next actions

Plan, priorities and dates: `docs/roadmap.md` (read only the current phase).

1. **Human** — roadmap Phase 0: Kiro credits request (before **2026-12-01 12:00 PT**), OVHcloud instance + bucket,
   `META_API_KEY`, AWS Bedrock access, final royalty-free demo song. With a new demo song: put the MP3 in
   `apps/web/public/demo/`, run `cd apps/api && uv run python scripts/analyze_file.py <mp3> <json>`, replace
   `features/player/demo/neon-nocturne.analysis.json` (+ title/url in `demo-song.ts`) **and `DEMO_AUDIO_HASH` in
   `apps/api/music_world/director/domain/demo.py`**; tests check both hashes.
2. **Human** — `06-template-store` task 7: real e-mail sign-in (`AUTH_EMAIL_SENDER=smtp` + `SMTP_*`) and the
   cross-user check on the public URL — `06-template-store/design.md` § Human checks.
3. **Human** — `05-ai-world-director` task 7 (real Muse / Bedrock calls) — `05-ai-world-director/design.md` § Human
   checks. If Muse rejects `response_format` json_schema, drop it in `providers/muse.py`.
4. **Human** — `07-xr-mode` task 7 on a Quest 3 (`07-xr-mode/design.md` § Human checks), incl. the Halloween template
   fps; then tick `03-world-engine-core` task 7.
5. Roadmap 8 — deploy (skill `deploy-ovh`): migrations `0003_accounts_templates`, `0004_template_reports` run at api
   start; set `PUBLIC_BASE_URL` (Compose default `https://$DOMAIN`), `AUTH_EMAIL_SENDER`/`SMTP_*`; the API image needs
   ffmpeg + torch CPU and `anthropic[bedrock]`; pre-download Demucs weights; then check `/upload`, `/templates`,
   `/api/director/providers`. Outbound SMTP (587) must be allowed on the instance.
6. Optional: `05-ai-world-director` task 6 (ShapeRecipe, P2); a template editor (publish non-AI templates from the
   UI); review UI for hidden templates; `02-music-analysis` 6.1 (Muse Voice); `01-foundation` 6.2/6.3/7.

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
| 05-ai-world-director 1–5 | Claude Code (ai-director) | done | merged with Phase 5 PR |
| 05-ai-world-director 6 | — | todo | ShapeRecipe (P2), skipped |
| 05-ai-world-director 7 | — | blocked | real calls need `META_API_KEY` / AWS credentials (human) |
| 06-template-store 1–6 | Claude Code | done | merged with Phase 6 PR |
| 06-template-store 7 | — | blocked | real e-mail (SMTP credentials) + public URL (human) |

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
