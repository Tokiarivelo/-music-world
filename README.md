# Music World

**Turn any song into a living 3D world you can explore in the browser or in VR on Meta Quest.**

Notes slide along a glowing musical staff, fall onto the terrain and build a neon city in sync with the music. An AI
world director (Meta Muse or Claude on Amazon Bedrock) reads the song's harmony, energy and lyrics and designs the
world as a template. Anyone can publish templates in a community store.

> Built with [Kiro](https://kiro.dev) for **Kiroween 2026** (category: Frankenstein).
> Status: **early development** — design, specs and agent setup are in place; application code starts now.

![Reference look](assets/reference-image-original.png)

## How it works

```text
Audio upload ─► Python analysis (Demucs, Basic Pitch, librosa) ─► notes, chords, tempo, key, energy, lyrics
            ─► AI World Director (Muse / Claude) ─► validated world template (data only)
            ─► Next.js + IWSDK ─► deterministic world engine driven by the audio clock ─► browser / Meta Quest
```

- Algorithms detect the notes; the LLM only interprets the mood and designs the world.
- The world is a pure function of playback time: pause, seek and replay always show the exact same world.
- Templates and AI output are validated data, never executed code.

## Stack

Next.js · TypeScript · IWSDK (Three.js, WebXR) · IWER · FastAPI · Python (Demucs, Basic Pitch, librosa) ·
PostgreSQL · Redis · OVHcloud (Docker Compose, Object Storage) · Meta Model API (Muse) · Amazon Bedrock (Claude).

## Built with Kiro

- **Specs** — `.kiro/specs/` (requirements in EARS format, design, tasks)
- **Steering** — `.kiro/steering/rules.md` is the single source of project rules for every agent
- **Skills** — `.kiro/skills/` · **Custom agents** — `.kiro/agents/` · **Hooks** — `.kiro/hooks/`
- **Handoff between agents** — `docs/handoff.md`
- Full log: [`KIRO_USAGE.md`](KIRO_USAGE.md)

## Documentation

- Design document (French): [`PROJECT.md`](PROJECT.md)
- Current status and next steps: [`docs/handoff.md`](docs/handoff.md)

## Development setup

Requirements: Python 3.12 via [uv](https://docs.astral.sh/uv/), Node 22+ with pnpm, Docker (for `make dev`).

```bash
cd apps/api && uv sync && cd ../..   # Python deps
pnpm install                          # web app + schema generator
make schemas                          # pydantic -> JSON Schema -> TS + zod
make check                            # lint + types + tests + architecture check
pnpm -C apps/web dev                  # http://localhost:3000/play/demo (IWER emulates a Quest 3 in dev)
                                      # demo: space = play/pause, arrows = seek ±5 s
                                      # /upload needs the API + worker (proxied from DEV_API_URL, default :8000)
```

VR mode: press **Enter VR** (IWER in dev, Quest Browser over HTTPS). The world becomes a tabletop diorama in front of
you; A/X = play/pause, thumbstick = seek ±5 s, grip = recenter, left-hand pinch = play/pause, and a floating panel
(trigger ray, hand pinch or poke) has play, seek ±10 s, restart, template picker, recenter and Exit VR. Automated
emulator check (needs `next dev` on port 3125 and Playwright's Chromium in `~/.cache/ms-playwright`):

```bash
pnpm -C apps/web exec next dev -p 3125 &
MW_ANGLE=vulkan node apps/web/scripts/xr-check.mjs   # GPU; without MW_ANGLE it uses SwiftShader and skips panel clicks
```

Full stack in Docker (Caddy, web, api, worker, postgres, redis):

```bash
make dev                              # then open https://localhost/play/demo (accept the local certificate)
curl -k https://localhost/api/health  # {"status":"ok",…}
```

`make help` lists every target. Production settings: copy `infra/.env.example` to `infra/.env`.
Without `S3_*` settings, uploads and stems go to a local directory (`STORAGE_DIR`, a Docker volume in Compose).

Upload a song at `https://localhost/upload`: the page shows the analysis progress per stage, then opens the world at
`/play/<projectId>`. The same with curl (MP3, WAV or FLAC, ≤ 25 MB, ≤ 3 minutes; optional timed lyrics `.lrc`):

```bash
curl -k -F audio=@song.mp3 -F lyrics=@song.lrc https://localhost/api/projects   # 202 {"projectId","jobId",…}
curl -k https://localhost/api/projects/<projectId>                               # status analyzing | ready | failed
```

### AI World Director

On `/play/demo` (or `/play/<projectId>`), pick a provider and press **Generate world with AI**: the API summarizes the
analysis (key, tempo, chords per section, energy curve, pitch range, lyrics), asks the model for a world template, then
validates and clamps it. The label shows which provider and model produced the world; generate again with another
provider to compare (both stay in the template list, also in VR). Without any key the deterministic `mock` director
answers, so the demo always works. To enable the real providers, set in `infra/.env` (server only):

- Meta Muse: `META_API_KEY` (models `META_DIRECTOR_MODEL=muse-spark-1.3`).
- Claude in Amazon Bedrock: `AWS_REGION` + AWS credentials (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, or
  `AWS_BEARER_TOKEN_BEDROCK`), model `BEDROCK_MODEL_ID=anthropic.claude-sonnet-5-5` (enable access in the console).
- `LLM_PROVIDER` picks the default; `META_SPEND_CAP_USD` (default 1) caps the estimated spend per song.

```bash
curl -k https://localhost/api/director/providers
curl -k -X POST https://localhost/api/projects/<projectId>/director -H 'content-type: application/json' -d '{"provider":"muse"}'
```

### Accounts

Publishing a template needs an account: on `/sign-in`, enter an e-mail address and open the single-use link (valid
15 minutes). Without SMTP settings (`AUTH_EMAIL_SENDER=console`, the default) the link is written to the api logs
(`make logs`, event `auth.sign_in_link`); set `AUTH_EMAIL_SENDER=smtp` and `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` in `infra/.env` to send real e-mails. Songs uploaded while signed in are
private to their owner; songs uploaded signed out stay readable by their link (the demo needs no account).

Signed in, an AI-generated world gets a **Publish to the store** button on the play page: the API validates the
template again (schema, 32 KB, built-in shapes, readable staff, plain-text name), gives it a unique id and a small
generated preview image, and lists it in the public gallery.

## License

[MIT](LICENSE)
