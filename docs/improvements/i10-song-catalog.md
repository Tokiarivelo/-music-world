# I10 — Song catalog, Garage / R2 storage, cheaper director prompt

## What it adds

- **Object storage**: one S3 client (`shared/object_store.build_s3_client`) for both stores: path-style addressing
  (Garage has no per-bucket DNS name) and checksums only when required (Cloudflare R2 rejects the default CRC32 trailer
  of recent botocore). Local: Garage in `infra/docker-compose.dev.yml` (`make dev-infra`, then `make garage-init`, which
  creates the layout, the bucket `music-world` and a key and prints the `S3_*` lines). Deployed: Cloudflare R2
  (`S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_REGION=auto`, private bucket, API token limited to
  that bucket). The `/api/health` probe uses the same client.
- **Catalog**: table `songs` (migration `0007_songs_catalog`): slug, title, artist, licence, source URL, `is_public`,
  audio hash and key, duration, the project that holds the analysis, and key / tempo / note count copied from the
  analysis. The notes, chords, sections and energy stay in `analyses.result` (one JSON document per audio hash).
- **Seed**: `apps/api/scripts/seed_songs.py` + `apps/api/seed/songs.json`. Stores the audio, creates the project, runs
  the real pipeline, saves the analysis and the catalog row. Re-runnable; `--force` recomputes (stems and raw notes are
  cached in the object store, so only the filters rerun); `--report` prints note-quality proxies.
- **Licences**: three tracks are Free To Use (credit required). One recording is all rights reserved: `is_public=false`,
  analysed for local tuning only, and the seed refuses it on any non-local object store, so it never reaches R2.
- **Director tokens**: audio analysis itself costs no LLM tokens (Demucs, Basic Pitch and librosa run on the worker's
  CPU). Tokens are spent once per song and provider (the result is cached by audio hash) on the director prompt, which is
  now `director-v4`: the schema copy in the system prompt drops `title` and `default` keywords (about 17 % fewer
  characters; the validator and structured output still use the full schema), the summary sends 16 energy points
  instead of 32, at most 800 lyric characters instead of 1500 and 6 chords per section instead of 8.

## Limits

The note-quality numbers (`analysis/domain/quality.py`) are proxies (share of note duration inside the estimated key,
notes per second per stem). They go the right way when spurious notes are removed but are not a transcription score; the
only real check is to listen. Songs up to 5 minutes are analysed whole; a longer one is analysed on its first 5 minutes only and plays whole with generic notes after that (`engine/generic-notes.ts`: one note per beat from the pitch classes the song used). A song over 30 minutes is refused.
