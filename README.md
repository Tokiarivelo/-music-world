# Music World

**Turn any song into a living 3D world you can explore in the browser or in VR on Meta Quest.**

Notes slide along a glowing musical staff, fall onto the terrain and build a neon city in sync with the music. An AI
world director (Meta Muse or Claude on Amazon Bedrock) reads the song's harmony, energy and lyrics and designs the
world as a template. Anyone can publish templates in a community store.

> Built with [Kiro](https://kiro.dev) for **Kiroween 2026**, category **Frankenstein**: Python DSP + an LLM world
> director + WebXR (IWSDK) + procedural generation + a community template store, stitched into one app.

![Reference look](assets/reference-image-original.png)

## Test it in 2 minutes (judges)

**Public URL: `TODO(deploy)` — not deployed yet.** Until it is, use the local run below.

1. Open `<public URL>/play/demo` (local: `http://localhost:3000/play/demo`). Press **Play**: the demo song
   *Neon Nocturne* (57.6 s, self-made and royalty-free, pre-analysed by the real pipeline) builds the world.
   `Space` = play/pause, `←` / `→` = seek ±5 s: the world jumps to exactly the state of that moment.
2. Press **Generate world with AI**: the director proposes a new template; the label shows which provider and model
   made it (without API keys the deterministic `mock` director answers, so this step always works).
3. Open `/templates` and pick **Kiroween Pumpkin Night** (pumpkins, tombstones, a haunted town) → **Use this
   template**.
4. On a Meta Quest: open the same URL in Quest Browser and press **Enter VR**: the world becomes a tabletop
   diorama with a floating control panel (details in [VR mode](#vr-mode)).
5. Optional: `/upload` an MP3, WAV or FLAC (≤ 25 MB, ≤ 3 minutes). The page shows the analysis progress per stage
   and then opens your song's world. CPU analysis takes a few minutes per song (Demucs separation dominates).
6. On the play pages the top-left bar links back to **Home**, **New song** (`/upload`) and **Templates**; on a phone it
   collapses to one menu button. Leaving a page stops the audio and disposes the world.

## Run locally

Requirements: Python 3.12 via [uv](https://docs.astral.sh/uv/), Node 22+ with pnpm, Docker (for `make dev`).
First time: `make install` (Python and Node dependencies from the lock files).

Pick one way. `make help` lists every target.

| Way | Command | Open | Ports |
|---|---|---|---|
| **A. Web only** (demo song, no backend) | `pnpm -C apps/web dev` | `http://localhost:3000/play/demo` | web 3000 |
| **B. Full stack in Docker** (production-like) | `make dev` | `https://localhost/play/demo` | Caddy 80 and 443 only |
| **D. Host, no Docker at all** | `make dev-local` | `http://localhost:3000/play/demo` | web 3000 (`WEB_PORT`), api 8000 (`API_PORT`) |
| **C. Hot reload on the host** (daily development) | `make dev-infra`, then `dev-api`, `dev-worker`, `dev-web` | `http://localhost:3000/play/demo` | web 3000 (`WEB_PORT`), api 8000, postgres 5432, redis 6379 (127.0.0.1) |

**A. Web only** — the AI button and the template store need the API.

```bash
pnpm install
pnpm -C apps/web dev        # IWER emulates a Quest 3 in dev
```

**D. No Docker** — `make dev-local` runs the API (SQLite file `apps/api/.data/dev.db`, migrations first) and the web
app together, `Ctrl-C` stops both. When `redis-server` is installed it also starts Redis and the analysis worker;
otherwise uploads are not analysed (demo, template editor, store and sign-in work). Override with `LOCAL_DB=…`,
`API_PORT`, `WEB_PORT` (and `DEV_API_URL` for the web proxy when `API_PORT` changes).

**B. Full stack in Docker** (Caddy, web, api, worker, postgres, redis); `docker compose up` from the repository
root also works (root `docker-compose.yml` includes `infra/docker-compose.yml` and `infra/.env`):

```bash
make dev                              # accept the local certificate in the browser
curl -k https://localhost/api/health  # {"status":"ok",…}
make up / make down / make logs       # background mode, stop, follow logs (make logs SERVICE=api)
```

`make dev` builds an image only when its sources changed (content hash), so a second run starts at once. The
`web` container listens on 3000 **inside** the Docker network; only Caddy publishes ports (80, 443), so `WEB_PORT`
has no effect here and nothing on your host's port 3000 is used or needed. Postgres credentials come from
`infra/.env` (optional locally); an old database volume with another password: `make db-password`.

**C. Hot reload on the host** (api, worker and web outside Docker; Postgres and Redis in Docker on 127.0.0.1):

```bash
cp apps/api/.env.example apps/api/.env          # optional: only to change a default
cp apps/web/.env.example apps/web/.env.local    # optional: WEB_PORT, DEV_API_URL
make dev-infra                                  # postgres + redis
make dev-all                                    # everything: docker infra + api + worker + web, one terminal
make dev-web-stack                              # postgres + redis + garage in Docker, then the web dev server on WEB_PORT
make kill-web                                   # stop forgotten web dev servers (kill-all: web, api and worker too)
make dev-api                                    # terminal 2: migrations, then uvicorn --reload on :8000
make dev-worker                                 # terminal 3 (only to analyse a song)
make dev-web                                    # terminal 4: Next dev server on WEB_PORT (default 3000)
```

Port 3000 taken? Set `WEB_PORT=3001` in `apps/web/.env.local` (or `make dev-web WEB_PORT=3001`) and
`PUBLIC_BASE_URL=http://localhost:3001` in `apps/api/.env` so sign-in links use the same port. `WEB_PORT` only
concerns the host dev server (way C); it is never passed to Docker. Stop the infra with `make down`.

**Developer checks:**

```bash
make -j3 check                        # schema drift + lint + types + tests + architecture (api and web in parallel)
make schemas                          # pydantic -> JSON Schema -> TS + zod
make disk && make prune               # disk usage, then safe Docker clean-up
```

## Features

| Feature | What it does | Where |
|---|---|---|
| Music analysis | ffmpeg decode → Demucs stem separation → Basic Pitch notes → librosa tempo, beats, key, chords, energy, sections; optional timed lyrics (`.lrc`). Resumable jobs with per-stage progress. | `apps/api/music_world/analysis` |
| World engine | `worldStateAt(plan, t)` is a pure function of playback time, driven only by the audio clock: pause, seek and replay always show the same world. Seeded PRNG per note. | `apps/web/src/engine` |
| Default look | *Neon Nocturne*: isometric cracked plate, diagonal glowing staff with Bravura clefs and notes, lit-window city and equalizer spikes, light arcs, particles — matched to the reference image above. | `apps/web/src/templates/default`, `apps/web/src/xr` |
| AI World Director | Summarizes the analysis (no raw notes, never full lyrics in logs), asks the model for a template, then sanitizes, clamps and validates it. Providers: Meta Muse Spark, Claude on Amazon Bedrock, deterministic mock; fallback chain, cache, per-song spend cap. LLM output is data, never code. | `apps/api/music_world/director`, `apps/web/src/features/director` |
| Template store | E-mail magic-link accounts, publish an AI-generated template (re-validated, 32 KB, built-in shapes only), public gallery, reports that hide a template at a threshold. Launch templates: Halloween **Kiroween Pumpkin Night** and the ocean **Nemo Reef** (21 kinds of sea objects — fish, shark, whale, jellyfish, octopus, turtle, shipwreck, treasure chest, coral… — all standing on the plate before the first note, more of them growing as notes land). | `apps/api/music_world/templates`, `/templates` |
| Full-screen world | The 3D view fills the whole screen on every aspect ratio (phone portrait to ultra-wide); the plate floats in a sky dome with horizon glow, stars, a fogged ground and two rings of hills, all derived from the template palette and drawn in 3 calls. The cinematic camera backs off on narrow screens to keep the plate in view. | `apps/web/src/xr/views/environment-view.ts`, `scripts/blank-ratio.mjs` |
| Layers | **Layers** popover: Drums, Bass, Vocals, Other instruments, Chords, Lyrics, Particles and effects, Staff, each switchable with a live meter, and presets (Everything, Rhythm only, Melody only, Voice and lyrics); karaoke lyrics line when the song has an `.lrc` or lyrics found online (artist and title can be typed when the file has no tags). View only: the audio and the world state are unchanged. | `apps/web/src/engine/layers.ts`, `features/world-view` |
| Onboarding | The home page leads to the demo in one click; a four-step guided tour (play, layers, notes, VR) opens on the first visit to `/play/demo`, can be skipped and replayed (`localStorage`, nothing sent). | `apps/web/src/features/onboarding` |
| Navigation | On desktop and phone the world opens in the cinematic view; **Explore** (or `N`) unlocks orbit (drag), pan (right-drag, Shift-drag, two fingers), zoom (wheel, pinch), WASD/QE fly, view presets (`1`–`4`: Overview, Staff, City, Top) and reset (`R`). **Walk** (or `G`) puts you inside the world at human scale: an 80 m plate, eye at 1.6 m, drag to look, WASD to walk, collisions with structures, the ground continues past the plate edge. In VR the world is life-size by default (left stick glides, right stick snap-turns, B / Y toggles the table-top diorama). Camera only: never touches the song or the world state. | `apps/web/src/xr/navigation`, `features/world-view` |
| Colors | The **Colors** button (bottom left) opens a popover: **Randomize** (a harmonious OKLCH scheme: analogous, complementary, triad or split-complement, with readable staff contrast), undo/redo, one color input and lock per role, Brightness and Contrast sliders (Brightness also scales the scene lights) and "Reset to the template". The scheme seed is shown ("Scheme #4F2A9"), copyable as a link and applied with `?palette=<seed>`: the same seed gives the same colors on every device. A view-only choice, saved per template in the browser; the template, the song and the audio are never touched. Neon Nocturne stays the dark reference look of `/play/demo`. | `apps/web/src/xr/palette-generator.ts`, `features/world-view` |
| Template editor | `/editor`: edit a copy of any template (palette, terrain, staff, effects, note rules, zones) with controls limited to the schema bounds, live preview over the demo song (`?project=<id>` for yours), validation next to each field. Works signed out (download the JSON); signed in, save a draft and publish it to the store. Entry points: "Edit a copy" on store cards and on the play page. Shape recipes are editable (parts, footprint, height scale, triangle budget; renaming or removing one rewrites its references). | `apps/web/src/features/template-editor`, `PUT /api/templates/{id}` |
| Object inventory and part editor | In the template editor: every object the template uses with a thumbnail and its usage, a part tree (select, rename, hide, duplicate, delete, add), a numeric inspector and an orbit view. Built-in objects open as an editable recipe copy. | `apps/web/src/features/template-editor` (`inventory-model`, `node-model`) |
| Map creator | `/maps` (`?from=<template id>` to start from a template, `?open=<saved id>` to reopen): create a map (empty city, meadow or underwater plate, or a copy of a template), place, move, rotate, scale, copy, array and delete objects seen from above, undo / redo, preview it in the real world view with the demo song, draft kept in this browser, save to the template store. | `apps/web/src/features/map-creator`, `layout.placed` in `music-world.template.v1` |
| XR mode | WebXR via IWSDK on Meta Quest: tabletop diorama, controllers, hand pinch, spatial panel with template picker. | `apps/web/src/xr` |

### VR mode

Press **Enter VR** (IWER in dev, Quest Browser over HTTPS). The world becomes a tabletop diorama in front of you:
A/X = play/pause, thumbstick = seek ±5 s, grip = recenter, left-hand pinch = play/pause, and a floating panel
(trigger ray, hand pinch or poke) has play, seek ±10 s, restart, template picker, recenter and Exit VR. Automated
emulator check (needs `next dev` on port 3125 and Playwright's Chromium in `~/.cache/ms-playwright`):

```bash
pnpm -C apps/web exec next dev -p 3125 &
MW_ANGLE=vulkan node apps/web/scripts/xr-check.mjs   # GPU; without MW_ANGLE it uses SwiftShader and skips panel clicks
```

## Architecture

```text
 Browser / Quest Browser                         OVHcloud instance (Docker Compose behind Caddy HTTPS)
┌──────────────────────────────┐   /api/*    ┌───────────────────────────┐   jobs   ┌──────────────────────────┐
│ Next.js + IWSDK (Three.js)   │ ──────────► │ FastAPI (Clean Architecture│ ───────► │ arq worker: analysis     │
│ features/ (upload, player,   │             │ per context: projects,     │  Redis   │ decode → Demucs → Basic  │
│ director, template-store)    │ ◄────────── │ director, templates, auth) │          │ Pitch → librosa stages   │
│ engine/ worldStateAt(plan,t) │  analysis + │        │          │        │          └──────────────────────────┘
│ xr/ views, systems, panel    │  templates  │   PostgreSQL   Object storage           Muse / Bedrock / mock
└──────────────────────────────┘             └───────────────────────────┘           (director, server-side keys)
```

- Algorithms detect the notes; the LLM only interprets the mood and designs the world.
- One contract pipeline: pydantic models → JSON Schema (`packages/schemas`) → TypeScript + zod (`make schemas`).
- No LLM call during playback; secrets stay server-side. Design document (French): [`PROJECT.md`](PROJECT.md).

## Configuration

Environment files: `infra/.env.example` (Docker stack and production, the global one), `apps/api/.env.example`
(API and worker on the host) and `apps/web/.env.example` (Next dev server, copy to `.env.local`).
Production settings: copy `infra/.env.example` to `infra/.env` and validate it with `make check-env`. Deploying
(`DEPLOY_HOST=user@host make deploy`), backups, restore and uptime checks: [`infra/README.md`](infra/README.md).
Without `S3_*` settings, uploads and stems go to a local directory (`STORAGE_DIR`, a Docker volume in Compose).

**Upload by curl** (MP3, WAV or FLAC, ≤ 25 MB, ≤ 3 minutes; optional timed lyrics `.lrc`):

```bash
curl -k -F audio=@song.mp3 -F lyrics=@song.lrc https://localhost/api/projects   # 202 {"projectId","jobId",…}
curl -k https://localhost/api/projects/<projectId>                               # status analyzing | ready | failed
```

**AI World Director.** On `/play/demo` (or `/play/<projectId>`), pick a provider and press **Generate world with
AI**. Generate again with another provider to compare (both stay in the template list, also in VR). To enable the real
providers, set in `infra/.env` (server only):

- Meta Muse: `META_API_KEY` (model `META_DIRECTOR_MODEL=muse-spark-1.3-contributor`).
- Claude in Amazon Bedrock: `AWS_REGION` + AWS credentials (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, or
  `AWS_BEARER_TOKEN_BEDROCK`), model `BEDROCK_MODEL_ID=anthropic.claude-sonnet-5-5` (enable access in the console).
- `LLM_PROVIDER` picks the default; `META_SPEND_CAP_USD` (default 1) caps the estimated spend per song.

```bash
curl -k https://localhost/api/director/providers
curl -k -X POST https://localhost/api/projects/<projectId>/director -H 'content-type: application/json' -d '{"provider":"muse"}'
```

**Accounts.** Publishing a template needs an account: on `/sign-in`, enter an e-mail address and open the single-use
link (valid 15 minutes). Without SMTP settings (`AUTH_EMAIL_SENDER=console`, the default) the link is written to the
api logs (`make logs`, event `auth.sign_in_link`); set `AUTH_EMAIL_SENDER=smtp` and `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` to send real e-mails. Songs uploaded while signed in are private to
their owner; songs uploaded signed out stay readable by their link (the demo needs no account).

**Template store.** Signed in, an AI-generated world gets a **Publish to the store** button on the play page: the API
validates the template again (schema, 32 KB, built-in shapes, readable staff, plain-text name), gives it a unique id
and a small generated preview image, and lists it in the public gallery `/templates` (no account needed), newest first
after the launch templates. **Use this template** opens `/play/demo?template=<store id>`
(`/play/<projectId>?template=<store id>` works too); the player's template picker, in 2D and in VR, also offers the
12 newest store templates. Signed-in visitors can **Report** a template; after `TEMPLATE_REPORT_HIDE_THRESHOLD`
(default 3) distinct reports it leaves the gallery. Uploads are limited to `UPLOAD_RATE_LIMIT_PER_HOUR` (default 20)
per user or IP, publication to `TEMPLATE_PUBLISH_RATE_LIMIT_PER_HOUR` (default 10) per user.
People listed in `MODERATOR_EMAILS` (comma-separated, empty by default) get a **Moderation** link and the page
`/moderation`: the hidden templates with their report reasons, each to **Restore** (published again, reports
forgotten) or **Remove** (deleted). Everyone else gets a 404, and every decision is written to an audit table.

```bash
curl -k https://localhost/api/templates?limit=5          # {"items":[…],"nextCursor":…}
```

## Built with Kiro

- **Specs** — 7 specs in `.kiro/specs/` (EARS requirements, design, tasks), one per roadmap phase.
- **Steering** — `.kiro/steering/rules.md` is the single source of project rules for every agent.
- **Skills** — `.kiro/skills/` · **Custom agents** — `.kiro/agents/` · **Hooks** — `.kiro/hooks/`.
- **Property-based testing** — fast-check (engine) and Hypothesis (analysis, director, store), checked by mutation.
- **Handoff between agents** — `docs/handoff.md`.
- Full write-up: [`KIRO_USAGE.md`](KIRO_USAGE.md).

## Languages

The UI is available in English, French and Malagasy (language select at the top of every page; choice kept in the
`mw_locale` cookie, otherwise `Accept-Language`). To add a language: copy `apps/web/src/i18n/messages/en/` to a new
folder (e.g. `es/`), translate the values (keep the `{parameters}` and plural forms), then add the code to `LOCALES`,
`LOCALE_NAMES` and `LOCALE_DIR` in `src/i18n/config.ts` and the imports in `src/i18n/catalogs.ts`; TypeScript and
`pnpm test` list anything missing. French and Malagasy are machine drafts until a native speaker reviews them.

## Known limitations

- Not deployed yet (public URL above is `TODO(deploy)`); the Quest 3 headset check, real Muse / Bedrock calls and
  real SMTP e-mail have not been run yet (all code paths are tested against fixtures and mocks).
- Analysis runs on CPU: about 6.5 minutes for a 3-minute song on a 4-core laptop; songs are capped at 3 minutes.
- Lyrics come only from an uploaded `.lrc` file (Muse Voice transcription is not wired yet).
- The AI director picks among built-in shape kinds; custom shape recipes (ShapeRecipe) are not implemented.
- Default look vs the reference image: no bloom haze in WebXR, beamed sixteenths drawn as separate flagged notes
  (full list in `.kiro/specs/04-default-template/design.md`).
- The VR panel uses the bundled MSDF Inter font: French and Malagasy accents must be checked on a Quest (glyphs missing
  from the atlas render as boxes). Lyrics are shown as transcribed, never translated.
- An unsaved document survives the sign-in round trip only in the
  same browser tab (`sessionStorage`; the magic link may open in another tab).
- Reported templates have no review UI; rate limits are in memory per API worker.

## Documentation

- Design document (French): [`PROJECT.md`](PROJECT.md) · Roadmap: [`docs/roadmap.md`](docs/roadmap.md)
- Current status and next steps: [`docs/handoff.md`](docs/handoff.md)
- Security review: [`docs/security-review.md`](docs/security-review.md) · ADRs: [`docs/decisions/`](docs/decisions/)
- Submission drafts (video, Devpost, social): [`docs/submission.md`](docs/submission.md)

## License

Music World is released under the [MIT License](LICENSE). No GPL/AGPL dependency.

Third-party components:

| Component | License | Use |
|---|---|---|
| [Bravura](https://github.com/steinbergmedia/bravura) font (Steinberg) | SIL Open Font License 1.1 (`assets/fonts/bravura/LICENSE.txt`) | Clef and note glyph outlines |
| [Immersive Web SDK](https://github.com/facebook/immersive-web-sdk) `@iwsdk/core` 1.1.0, IWER 2.8.0 | MIT | WebXR runtime, Quest emulator |
| three.js (super-three 0.185.0), Next.js 16, React 19, zod, fast-check | MIT | Web app |
| [Demucs](https://github.com/facebookresearch/demucs) | MIT | Stem separation |
| [Basic Pitch](https://github.com/spotify/basic-pitch) | Apache-2.0 | Note transcription (bundled ONNX model) |
| librosa (ISC), PyTorch (BSD), onnxruntime (MIT), soundfile (BSD) | permissive | Analysis |
| `soxr` (LGPL-2.1), `lameenc` (LGPL-3.0) | LGPL, dynamically linked, unmodified | Transitive analysis dependencies |

Details: [`docs/decisions/001-analysis-ml-stack.md`](docs/decisions/001-analysis-ml-stack.md). The demo song
*Neon Nocturne* is synthesized by `apps/api/scripts/synth_song.py` (self-made, royalty-free).
