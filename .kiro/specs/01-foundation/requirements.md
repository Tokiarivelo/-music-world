# Requirements Document

## Introduction

Set up the Music World monorepo so that every later spec can be built and deployed: a Next.js web app that hosts an
IWSDK world (testable without a headset through IWER), a FastAPI backend with a job worker, shared schemas, a Web
Audio player that exposes the audio clock, and a Docker Compose stack deployable on one OVHcloud instance over HTTPS.

## Requirements

### Requirement 1 — Monorepo and license

**User Story:** As a developer, I want a single repository with the web app, the API and shared schemas, so that one
`git clone` and one command start everything.

#### Acceptance Criteria

1. THE repository SHALL contain `apps/web`, `apps/api`, `packages/schemas`, `infra` and a root `LICENSE` file (MIT).
2. THE `.kiro` directory SHALL be committed and SHALL NOT appear in `.gitignore`.
3. WHEN a developer runs `make dev` THEN the system SHALL start web, api, worker, postgres and redis locally.
4. THE repository SHALL contain no dependency under GPL or AGPL.

### Requirement 2 — IWSDK world inside Next.js

**User Story:** As a developer, I want the IWSDK world to run inside a Next.js page, so that the store, the player and
the 3D world live in one application.

#### Acceptance Criteria

1. WHEN the `/play/demo` page loads THEN the system SHALL create an IWSDK world in a client-only component with no
   server-side rendering of the 3D code.
2. WHEN running in development mode THEN the system SHALL install the IWER runtime (Meta Quest 3 profile) before
   creating the world.
3. WHEN the user clicks "Enter VR" in a WebXR-capable context THEN the system SHALL start an `immersive-vr` session
   with a `local-floor` reference space.
4. WHEN the page is left THEN the system SHALL dispose of the world, the renderer and the XR session without leaking
   WebGL contexts.
5. IF the IWSDK world cannot be created inside Next.js THEN the team SHALL switch to the documented fallback
   (separate Vite IWSDK app under `/world`) and record the decision in `KIRO_USAGE.md`.

### Requirement 3 — Audio clock

**User Story:** As a viewer, I want visuals to stay in sync with the music, including after pause and seek.

#### Acceptance Criteria

1. THE audio player SHALL expose `now(): number` in seconds from song start, derived only from `AudioContext.currentTime`.
2. WHEN playback is paused THEN `now()` SHALL stay constant.
3. WHEN the user seeks to time `s` THEN `now()` SHALL return `s` (± 5 ms) immediately after the seek.
4. WHEN playback rate changes THEN `now()` SHALL advance at that rate.
5. THE player SHALL support play, pause, resume, stop and seek, and report duration.

### Requirement 4 — API skeleton and jobs

**User Story:** As a developer, I want an API with a background worker, so that long analyses do not block requests.

#### Acceptance Criteria

1. THE API SHALL expose `GET /health` returning the API version and the status of postgres, redis and object storage.
2. WHEN a job is enqueued THEN the worker SHALL process it and the API SHALL report its status
   (`queued`, `running`, `done`, `failed`) and progress (0–1).
3. THE API SHALL read secrets only from environment variables and SHALL never return them in responses.

### Requirement 5 — Shared schemas

**User Story:** As a developer, I want one source of truth for data contracts, so that Python and TypeScript never drift.

#### Acceptance Criteria

1. THE pydantic models in `apps/api/music_world/schemas` SHALL be the source of truth.
2. WHEN `make schemas` runs THEN the system SHALL export JSON Schema to `packages/schemas` and generate TS types and
   zod validators in `apps/web/src/templates/generated`.
3. Generated files SHALL start with a `GENERATED — do not edit` header.

### Requirement 6 — Deployment on OVHcloud

**User Story:** As a judge, I want to open a public HTTPS URL, so that I can test the app in a browser and on a Quest.

#### Acceptance Criteria

1. THE `infra/docker-compose.yml` SHALL run web, api, worker, postgres, redis and caddy.
2. Caddy SHALL obtain a Let's Encrypt certificate for the configured domain and proxy `/api/*` to the API.
3. WHEN deployed THEN `https://<domain>/api/health` SHALL return status ok.
4. Files SHALL be stored in an S3-compatible bucket (OVHcloud Object Storage) configured by environment variables.
