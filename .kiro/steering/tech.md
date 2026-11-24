---
inclusion: always
---

# Tech stack and engineering rules

## Stack

| Layer | Choice |
|---|---|
| Web app | Next.js (App Router), React, TypeScript (strict) |
| 3D / XR | IWSDK (`@iwsdk/core`) on Three.js; IWER (`iwer`) for desktop XR emulation in development |
| Client state | Zustand (2D UI only) |
| Validation (TS) | zod, generated from the JSON Schemas in `packages/schemas` |
| Tests (TS) | Vitest + fast-check (property-based) |
| API | Python 3.12, FastAPI, pydantic v2 |
| Jobs | Redis + arq worker |
| Analysis | Demucs (htdemucs), Spotify Basic Pitch, librosa, pretty_midi |
| Tests (Py) | pytest + Hypothesis (property-based) |
| Data | PostgreSQL, OVHcloud Object Storage (S3-compatible) |
| LLM | Switchable: Meta Model API (Muse) or Amazon Bedrock (Claude), plus a deterministic mock |
| Hosting | One OVHcloud CPU instance, Docker Compose, Caddy with Let's Encrypt HTTPS |

Do **not** add: React Three Fiber / Drei (conflicts with IWSDK's renderer), Essentia (AGPL), any GPL/AGPL dependency
(the repo is MIT).

## Non-negotiable rules

1. **Algorithms find notes; the LLM interprets.** Never ask an LLM to detect notes, chords, tempo or key.
2. **LLM output is data only.** Every LLM response is parsed as JSON and validated against a pydantic schema.
   Invalid output is rejected and replaced by the default template. Never `eval`, never execute generated code.
3. **No LLM call in the playback loop.** The director runs once per (audio hash, prompt version) and is cached.
4. **The audio clock is the only time source.** Read `AudioContext.currentTime`. Never use `setTimeout` /
   `setInterval` to schedule visual events.
5. **The world is a pure function of time.** `worldStateAt(plan, t)` must not depend on previous frames.
   Animation state is derived from `t - spawnTime`. All randomness uses the seeded PRNG in `engine/prng.ts`.
6. **Templates are data.** No JS, no external URLs. 3D assets are `ShapeRecipe`s (closed op list) or validated GLB.
7. **Secrets stay on the server.** `META_API_KEY` is read only by the Python API. Never prefix it with `NEXT_PUBLIC_`.

## Environment variables

Core, accounts and template-store variables: `env.md` (loaded when you touch settings, `.env.example` or `infra/`).
Provider variables (Bedrock, Muse) are below. Code defaults: `apps/api/music_world/shared/settings.py`.

## LLM providers (switchable)

The director talks to an `LLMProvider` interface (`complete_json(system, user, schema) -> dict`). The provider is
chosen per request (UI selector) or by default with `LLM_PROVIDER`:

| `LLM_PROVIDER` | Backend | Notes |
|---|---|---|
| `muse` (default) | Meta Model API | Muse Spark / Wonder |
| `bedrock` | Amazon Bedrock, Anthropic Claude models | Same model family Kiro uses in the IDE. Kiro itself has no runtime API for apps. |
| `mock` | Deterministic rules | No key needed; always available as fallback |

Bedrock env (Claude in Amazon Bedrock, `bedrock-mantle` Messages API through `anthropic[bedrock]`):

| Env var | Default | Use |
|---|---|---|
| `LLM_PROVIDER` | `muse` | Default director provider (`muse`, `bedrock`, `mock`); unconfigured → next in the chain |
| `AWS_REGION` | — | Required for Bedrock |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_PROFILE`, `AWS_BEARER_TOKEN_BEDROCK` | — | Server-only credentials (keys, profile or a Bedrock API key); none → Bedrock skipped |
| `BEDROCK_MODEL_ID` | `anthropic.claude-sonnet-5-5` | Director (Sonnet class); check access in the Bedrock console |
| `BEDROCK_SHAPE_MODEL_ID` | `anthropic.claude-opus-5-5` | ShapeRecipe generation (Opus class, optional) |
| `DIRECTOR_TIMEOUT_SEC` | `30` | Per provider call; over it → next provider |
| `DIRECTOR_AUDIO_HINT` | `false` | Optional 30 s audio mood hint (plumbed, not sent by any provider yet) |
| `DIRECTOR_RATE_LIMIT_PER_HOUR` | `30` | Director generations per client IP and API worker (`429 RATE_LIMITED`) | Both real providers share the same prompts, schema
validation, cache and fallback chain: selected provider → other real provider (if configured) → mock.
Lyrics transcription is separate: `LYRICS_PROVIDER = muse | lrc | none` (`lrc` = user-supplied file).

## Meta Model API (Muse)

| Env var | Default | Use |
|---|---|---|
| `META_API_KEY` | — | Server only. Empty → provider skipped. |
| `META_BASE_URL` | `https://api.meta.ai/v1` | |
| `META_DIRECTOR_MODEL` | `muse-spark-1.3-contributor` | Music summary + lyrics → `WorldTemplate` JSON |
| `META_SHAPE_MODEL` | `muse-wonder-1.0` | Optional: `ShapeRecipe` generation |
| `META_VOICE_MODEL` | `muse-voice-transcribe-1.0` | Lyrics from the Demucs vocal stem |
| `META_SPEND_CAP_USD` | `1` | Estimated USD per analysis (audio hash), both real providers; over it → mock |

- The API is in public preview: verify model ids, request formats and the voice endpoint in Meta's docs before coding.
- Decision 2026-11-24: the director uses the cheaper `muse-spark-1.3-contributor` by default; Meta may train on the
  inputs (text summary + lyrics, never the audio file). The upload page must keep telling users (`UPLOAD_TEXT.dataNote`).
  Voice / shape contributor ids are not verified: keep the standard ids for them. `META_DIRECTOR_MODEL=muse-spark-1.3` opts out.
- Spark 1.3 audio input is not fully supported: only an optional mood hint, never required.
- Muse Voice Transcribe is built for speech: always keep the `.lrc` upload and "no lyrics" fallbacks.

## IWSDK inside Next.js

The official IWSDK docs only describe Vite. `virtual:iwsdk-project`, automatic IWER injection and the scene editor come
from `@iwsdk/vite-plugin-dev` and are **not available** in Next.js. Therefore:

- Load the world from a client component (`features/world-view/components/WorldCanvas.tsx`) via
  `dynamic(() => import(...), { ssr: false })`; the IWSDK code lives in `src/xr/world-host.ts`.
- In development only, install IWER **before** creating the world:
  `const d = new XRDevice(metaQuest3); d.installRuntime();`
- Pass options in code: `World.create(container, { xr: { sessionMode: SessionMode.ImmersiveVR, referenceSpace: ReferenceSpaceType.LocalFloor, offer: 'none' } })`.
- Use `World.create`, `world.launchXR()`, `world.exitXR()`. Never `new World()`, `createWorld()` or `world.start()`.
- Keep Havok physics and worker locomotion off unless proven to work with the Next.js bundler.
- Local HTTPS: `next dev --experimental-https` (WebXR requires a secure context on Quest).
- Fallback if integration fails: a separate Vite IWSDK app served under `/world`.

## Performance budget (Meta Quest 3)

- ≥ 72 fps; request 90 Hz with `updateTargetFrameRate(90)` only if the budget holds.
- < 100 draw calls: one `InstancedMesh` per shape kind, shared materials, no per-note meshes.
- Compressed textures (KTX2), total texture memory < 256 MB.
- Note glyphs: Bravura (SMuFL, OFL) outlines extracted at build time and rendered as instanced geometry
  (`xr/glyphs/`, one `InstancedMesh` per glyph kind).

## Testing

- Every engine module has property tests: determinism, seek equivalence (`stateAt(t)` after seeking == after playing),
  monotonic spawn counts, bounded instance counts.
- Every schema has a property test: any LLM output either fails validation or yields a renderable template.
- Python analysis has Hypothesis tests on invariants (notes sorted, durations > 0, chord notes overlap in time).
