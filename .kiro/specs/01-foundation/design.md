# Design Document — 01 Foundation

## Overview

One monorepo, two runtimes (Node for the web, Python for analysis and AI), one Docker Compose stack.

```text
Browser / Quest Browser
   │ HTTPS
   ▼
Caddy (Let's Encrypt)
   ├── /api/*  ──► api (FastAPI, uvicorn)
   │                 └── enqueue ──► redis ──► worker (arq)
   └── /*      ──► web (Next.js, standalone output)
postgres ◄── api, worker
OVHcloud Object Storage (S3) ◄── api, worker
```

## Components

### Web (`apps/web`)

- Next.js App Router, TypeScript strict, `output: 'standalone'` for a small Docker image.
- `src/xr/world-host.ts`, mounted by `src/features/world-view/components/WorldCanvas.tsx` (client component, loaded
  by `WorldView` with `dynamic(..., { ssr: false })`). Implemented against IWSDK 1.1.0 (checked in the installed
  typings, not from memory):

```ts
export function createMusicWorld(container: HTMLDivElement, deps = defaultDeps): Promise<WorldHandle>
// 1. dev only: if native navigator.xr does not support immersive-vr, install IWER (metaQuest3) with
//    { forceInstall: true } — desktop Chrome exposes an empty native navigator.xr; a real Quest keeps its runtime.
// 2. World.create(container, { xr: { sessionMode: ImmersiveVR, referenceSpace: LocalFloor, offer: 'none' } })
// 3. handle: enterVR = world.launchXR(), exitVR = world.exitXR(), isVRSupported(), dispose()
```

- Creations are **serialized** in a module queue: two concurrent `World.create` calls leave one pending forever
  (React StrictMode double mount), leaking a canvas.
- Dispose: exit XR if a session is active, `world.destroy()` (systems + render loop + resize listener),
  `renderer.dispose()`, `renderer.forceContextLoss()`, remove the canvas. Idempotent. `src/xr/world-host.test.ts`
  mounts/unmounts 5 times with a fake world.
- `three` is aliased to `npm:super-three@0.185.0`, the build IWSDK 1.1.0 depends on, so only one three is bundled.
- `src/features/player/lib/audio-player.ts` (exported from the `player` barrel):

```ts
interface AudioClock { now(): number; isPlaying(): boolean; rate(): number }
class AudioPlayer implements AudioClock {
  // state: ctx, buffer, source?, startedAtCtx, offsetSec, rate, playing
  // now() = playing ? offsetSec + (ctx.currentTime - startedAtCtx) * rate : offsetSec
  play(); pause(); seek(sec); setRate(r); stop(); duration();
}
```

  A new `AudioBufferSourceNode` is created on each play/seek (they are one-shot). `now()` is clamped to `[0, duration]`.

### API (`apps/api`)

- `music_world/main.py` FastAPI app factory, `music_world/shared/settings.py` (pydantic-settings),
  `music_world/shared/container.py` (composition root), `music_world/worker.py` (arq), `music_world/projects/`
  context with the `jobs` aggregate (Clean Architecture layers, see `architecture.md` steering).
- Tables (SQLAlchemy + Alembic): `jobs(id, kind, status, progress, error, created_at, updated_at)`.
- `GET /health`, `GET /jobs/{id}`.

### Schemas

- `music_world/schemas/*.py` → `scripts/export_schemas.py` writes `packages/schemas/*.schema.json`.
- `json-schema-to-zod` (or `quicktype`) generates `apps/web/src/templates/generated/*.ts`.

### Infra

- `infra/docker-compose.yml`, `infra/Caddyfile`, `infra/.env.example`, `infra/deploy.sh` (rsync + `docker compose up -d --build`).
- Volumes for postgres and caddy data. Healthchecks on every service.

## Error handling

- Web: if WebXR is unavailable, hide "Enter VR" and keep the desktop view.
- API: uniform error body `{ "error": { "code", "message" } }`.

## Testing

- Vitest: `AudioPlayer` with a fake `AudioContext` whose `currentTime` is controlled by the test.
- fast-check property: for any sequence of play/pause/seek/advance operations, `now()` equals a reference model.
- pytest: `/health`, job lifecycle with a fake job.
