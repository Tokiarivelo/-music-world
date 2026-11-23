# Implementation Plan

- [ ] 1. Repository skeleton
  - Create `apps/web`, `apps/api`, `packages/schemas`, `infra`, root `Makefile` (targets listed in `infrastructure.md` steering, `make check` runs `scripts/agents/validate-architecture.sh`), MIT `LICENSE`, `.gitignore` (without `.kiro`).
  - _Requirements: 1.1, 1.2_

- [ ] 2. Next.js app
  - [ ] 2.1 Scaffold Next.js (App Router, TS strict, ESLint, `output: 'standalone'`), Vitest and fast-check.
  - [ ] 2.2 Add `@iwsdk/core`, `three`, `iwer`; create `src/xr/world-host.tsx` and `/play/demo` showing one glowing cube.
    - Verify current IWSDK API names in the official docs before writing code.
    - _Requirements: 2.1, 2.2, 2.3_
  - [ ] 2.3 Implement dispose and a mount/unmount smoke test.
    - _Requirements: 2.4_
  - [ ] 2.4 Checkpoint: cube visible on desktop, Enter VR works in IWER. If not, apply the Vite fallback and log it.
    - _Requirements: 2.5_

- [ ] 3. Audio clock
  - [ ] 3.1 Implement `AudioPlayer` / `AudioClock` in `src/features/player/lib/audio-player.ts`.
  - [ ] 3.2 Property test: random play/pause/seek/rate/advance sequences match a reference model.
  - _Requirements: 3.1–3.5_

- [ ] 4. FastAPI and worker
  - [ ] 4.1 Scaffold `music_world` package (uv or poetry), settings, `/health`.
  - [ ] 4.2 arq worker, `jobs` table, `GET /jobs/{id}`, fake job + tests.
  - _Requirements: 4.1–4.3_

- [ ] 5. Schema pipeline
  - `make schemas`: export pydantic → JSON Schema → TS + zod, with GENERATED header.
  - _Requirements: 5.1–5.3_

- [ ] 6. Docker Compose and OVHcloud
  - [ ] 6.1 Dockerfiles (web standalone, api, worker), `infra/docker-compose.yml`, Caddyfile, `.env.example`.
  - [ ] 6.2 S3 client configured for OVHcloud Object Storage; upload/download smoke test.
  - [ ] 6.3 `infra/deploy.sh`; deploy and verify `https://<domain>/api/health`, then open `/play/demo` on a Quest.
  - _Requirements: 6.1–6.4, 1.3_

- [ ] 7. Day-1 risk checks (record results in `KIRO_USAGE.md` and `PROJECT.md` §13)
  - Muse Voice Transcribe on a 30 s sung vocal stem: usable or not?
  - Bedrock access to a Claude model in the chosen region.
