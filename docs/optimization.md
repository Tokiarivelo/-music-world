# Optimization review — local development and production build

Measured on this laptop (8 cores, 2026-11-24, no network to PyPI during the session). "Applied" means the change is in
the repository; "Backlog" points to `docs/backlog-agent.md`.

## 1. Measurements

| Step | Time | Note |
|---|---|---|
| `pytest -m "not slow"` (313 tests) | 30–34 s | sum of the slowest 8 tests = 17 s; the rest is imports + 300 small tests, serial |
| `vitest run` (213 tests, 44 files) | 23 s | |
| `eslint` / `tsc --noEmit` | 6 s / 4 s | |
| `mypy` / `ruff` | 3.7 s / 0.2 s | |
| `make schemas` (drift check) | < 5 s | spawns uv + node |
| `make check` before | ≈ 75 s | strictly serial |
| `import music_world.main` | 1.1 s | `shared/container.py` 0.59 s, `accounts.interfaces.http` 0.7 s cumulative |
| `next build` (warm, Turbopack) | 19 s wall, 40 s CPU | compile 8 s, typecheck 8 s |
| Web JS, all chunks | 15.7 MiB | one lazy chunk (IWSDK + three) is 5.97 MB, 1.5 MB gzip |
| Standalone web output | 41 MB | `node_modules` 39 MB |
| `apps/api/.venv` / `node_modules` / `apps/web/.next` | 1.7 GB / 715 MB / 583 MB | disk is 97 % full: 8.5 GB free |

## 2. Findings and actions

### Docker build (production and `make dev`)

| # | Finding | Action | Status |
|---|---|---|---|
| D1 | `make dev` ran `compose up --build` every time: BuildKit re-checks both images, and the API image re-ran the Demucs download after any code edit (the weights layer came **after** `COPY apps/api/`) | `infra/scripts/build-changed.sh`: content hash of each image's inputs, build only when it changed or the image is missing; `make dev`, `up`, `build` use it; `rebuild` forces | Applied |
| D2 | Layer order in `api.Dockerfile`: code before weights | Order is now system packages → `pyproject` + lock → Demucs weights → code. A code change rebuilds two small layers | Applied (verify: backlog C3) |
| D3 | `chown -R app /app /opt/models` in its own `RUN` duplicated the code and the 80 MB weights in a new layer | `COPY --chown`, `chown` of the weights directory inside the download `RUN`, user created before | Applied |
| D4 | No build caches: a lock-file change re-downloaded torch CPU (~200 MB wheels) and the whole pnpm store | BuildKit cache mounts: uv cache, pnpm store, `.next/cache` (incremental Next build). Not stored in the image | Applied |
| D5 | Build context contained docs, `.kiro`, `assets`, tests, fixtures, `*.md`: every doc edit invalidated `COPY apps/...` hash inputs and slowed context upload | `.dockerignore` extended (docs, `.kiro`, `.claude`, `assets`, scripts, `apps/api/tests`, `**/*.md`, `**/.data`) | Applied |
| D6 | The `web` service had no `image:` name, so it could not be checked or pruned by name | `image: music-world-web` | Applied |
| D7 | `buildx --check` on both Dockerfiles | no warnings | Verified |
| D8 | `api` and `worker` use one image (good); `--workers 2` in both the Dockerfile `CMD` and Compose | keep: Compose overrides the command, the `CMD` is the standalone default | No change |

### Local development

| # | Finding | Action | Status |
|---|---|---|---|
| L1 | The only dev path was the production-like Docker stack: no hot reload, a rebuild per edit | `make dev-infra` (Postgres + Redis on 127.0.0.1 via `docker-compose.dev.yml`) + `dev-api` (uvicorn `--reload`) + `dev-worker` (`arq --watch`) + `dev-web` (Turbopack HMR). Docker `make dev` stays for the full prod-like check | Applied |
| L2 | No `.env.example` for the host-run API or the web app (only `infra/.env.example`); `Settings` reads no file | `apps/api/.env.example` (loaded by `uv run --env-file`, optional), `apps/web/.env.example` (copy to `.env.local`), `infra/.env.example` stays the global one | Applied |
| L3 | `make check` ran everything serially (≈ 75 s) | split into `check-api`, `check-web`, `arch`, `schemas-check`; `make -j3 check` runs api and web in parallel (measured 46 s vs ≈ 75 s serial, bounded by pytest, all green) | Applied |
| L4 | pytest is serial on 8 cores | `pytest-xdist` `-n auto` (expected 30 s → ~10 s); needs network once to add the dependency, so not applied | Backlog B2 |
| L5 | `import music_world.main` takes ~1.1 s (FastAPI 0.8 s, SQLAlchemy 0.36 s, boto3 0.28 s) | boto3 and botocore are imported only when S3 is configured (`object_store.py`, `probes.py`); FastAPI and SQLAlchemy are required | Applied (−0.1 to −0.3 s) |
| L6 | Disk 97 % full; stale tool caches and images accumulate | `make disk`, `prune`, `prune-images`, `prune-cache`, `prune-all`, `clean`, `clean-deps`, guarded `prune-volumes` | Applied; run once: backlog B7 |

### Production runtime and delivery

| # | Finding | Action | Status |
|---|---|---|---|
| P1 | Web output is standalone (41 MB), Turbopack build, `poweredByHeader` off | nothing to do | OK |
| P2 | The 6 MB IWSDK + three chunk is **lazy** (`dynamic(..., { ssr: false })` in `WorldView`): `/`, `/sign-in`, `/templates`, `/upload` load 10 small chunks only. IWER (the emulator) is **absent** from the production bundle (checked: no `metaQuest3` string) | keep; `apps/web/scripts/check-bundle.mjs` fails the build (`make bundle-check`, web Dockerfile) when a light page loads the engine or exceeds 900 KB of JS | Applied |
| P3 | `/play/*` downloads ~1.5 MB gzip of JS plus a 922 KB demo MP3; Caddy already does `encode zstd gzip`, Next sets immutable headers on `/_next/static` | add `Cache-Control` for `/demo/*`; verify headers with `curl -kI` | Backlog B4 |
| P4 | `uvicorn --workers 2` loads two copies of the app; rate limits are per worker (known) | acceptable for one demo instance; revisit only if memory is tight (worker + Demucs need 4 GB+) | No change |
| P5 | Post-deploy image growth on a 40 GB disk | `infra/README.md` already says `docker image prune -f` + `docker builder prune -f`; `make prune` is the same on a dev machine. Never `prune-volumes` on the server (the target refuses when `infra/.env` is production) | Applied |

### Not worth doing now

- Splitting the 6 MB chunk further: IWSDK bundles its own renderer; the player needs it all. A KTX2/Draco pass belongs
  to the Quest performance work (`xr-verify`).
- A multi-stage rewrite of the API image to slim torch: torch CPU wheels are the floor (~1.2 GB image); the saving
  is small compared to the risk before the deadline (2026-12-04).

## 3. Daily commands

```bash
make dev-infra && make dev-api      # terminal 1, 2 (+ make dev-worker when you analyse a song)
make dev-web                        # terminal 3: http://localhost:3000/play/demo (WEB_PORT=3001 if 3000 is taken)
make -j3 check                      # before a commit (api and web in parallel)
make dev                            # full Docker stack before a PR that touches infra or Dockerfiles
make disk && make prune             # when the disk is above 90 %
```
