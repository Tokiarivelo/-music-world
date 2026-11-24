# Pitfalls (moved out of `docs/handoff.md` § 5 to keep the session start cheap)

Read the group of the area you touch. The few that bite every session stay in the handoff.

## API, analysis and director

- `basic-pitch` 0.4.0 requires TensorFlow < 2.15.1 (no Python 3.12 wheels): `apps/api/pyproject.toml`
  `override-dependencies` removes it and runs the bundled ONNX model. Do not "fix" that override.
- torch / torchaudio must come from the PyTorch CPU index (`[tool.uv.sources]`); a plain PyPI torch pulls ~3 GB of
  CUDA. Disk on this laptop is ~98 % full: watch `df -h` before adding models or images.
- Docker worker: librosa/numba needs `NUMBA_CACHE_DIR` (set in the Dockerfile and Compose); without it Basic Pitch fails
  with "cannot cache function ... no locator available" after minutes of Demucs.
- Never import analysis infrastructure (torch, librosa) at module level in code the API process loads.
- `.gitignore` ignores audio except `apps/api/tests/fixtures/*.{wav,mp3,flac}` and `apps/web/public/demo/*.mp3`.
- Generated TS (`templates/generated`) and `packages/schemas` come from `make schemas` — never edit by hand.
  zod does not re-check pydantic `model_validator`s (analysis invariants, zone bounds).
- Local API without Docker: `DATABASE_URL=sqlite+aiosqlite:///<file> uv run alembic upgrade head` then uvicorn;
  `next dev` with `DEV_API_URL`. Sign-in links appear in the api log (`auth.sign_in_link`, console sender).
- Rate limits (director, sign-in, publish, upload) are in memory per uvicorn worker (2 workers → up to 2×).
- Director: change any prompt → bump `PROMPT_VERSION`; mock output changes → bump `MOCK_MODEL`.
  `director/infrastructure/default_template.json` must equal the web `neon-nocturne.json` (test).
- `anthropic` 2.x uses `httpx2`: mock its transport with `httpx2.MockTransport`.
- Muse and Bedrock adapters, and the SMTP sender, were never run against live services (no credentials).
- Body limits live in two places (`main.py` `path_limits` and the Caddyfile): a new upload route needs both.
- Production `create_app` raises on `SESSION_COOKIE_SECURE=false` / `http://` `PUBLIC_BASE_URL`: tests that build a
  production app must pass an https `public_base_url`.

## Web, XR and browser tests

- `xr-check.mjs` ends with a console check that fails on `500` from `/api/*` when no backend runs (not an XR failure).
- Navigation UI must not sit at the bottom of the canvas: the player bar covers it (controls are top-right).
- Next's route announcer is an empty `role="alert"`: in browser tests select `p[role=alert]`.
- IWSDK 1.1.0: never run two `World.create` at once — use `createMusicWorld` (queued). Its canvas follows the
  window: 2D controls must be absolutely positioned above it.
- Next 16 auto-writes `apps/web/AGENTS.md` on `next dev`; disabled with `agentRules: false` — keep it off.
- `three` must stay aliased to the super-three version IWSDK depends on; bump both together.
- Colors are linear in three.js: use `lightness()` (`xr/palette.ts`) for perceived brightness factors.
- `bravura-outlines.ts` is generated: rerun `scripts/extract_bravura_glyphs.py`, never edit by hand.
- Playwright: `executablePath` `~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, `--use-angle=vulkan` to
  see the world. A scratch script must import `playwright-core` by absolute path (`apps/web/node_modules/...`).
- IWER: panel clicks need `MW_ANGLE=vulkan` for `xr-check.mjs`. Dev-only globals `window.__mwWorld` /
  `__mwXRDevice` are read by it; keep them development-only. The VR panel has only 4 template slots.
- Panel text uses the bundled MSDF Inter font: no U+2212 minus or other missing glyphs (rendered as boxes).
- Auth: every web call with a body goes through `apiFetch` (`src/lib/api-client.ts`), or signed-in users get
  `403 CSRF_FAILED`. Tests use `base_url="https://test"` so the `Secure` cookies are sent.

## Tooling, infra and process

- pnpm is v12 here: offline installs need `--offline --trust-lockfile`; `pnpm run` may auto-install first (verify-deps).
- Do not add a `packageManager` field to `package.json` (corepack download times out here).
- No repo Prettier config: format with `npx prettier --print-width 120 --single-quote` on the files you touch only.
- Do not `pkill -f "<pattern>"` from the agent shell: it kills the shell itself; keep PIDs.
- New external origin in the web app (CDN, presigned S3 URLs) → extend the Caddy CSP, or it is blocked silently.
- Never `docker volume prune` on the server (pgdata, storage, Let's Encrypt certificates).
- Deadline: Kiroween submission **2026-12-04 14:00 PT**; demo audio must be royalty-free.

## Added 2026-11-24 (tooling session)

- pnpm is v12 here: offline installs need `--offline --trust-lockfile`; `pnpm run` may auto-install first (verify-deps).
  Never interrupt a running `pnpm install` (it half-breaks `node_modules`).
- Old `pgdata` volume + changed `POSTGRES_PASSWORD` → `make db-password`.
