# Design Document — 02 Music Analysis

## Pipeline (worker job `analyze_project`)

```text
decode (ffmpeg → 44.1 kHz WAV) ─► hash ─► cache hit? ──yes──► done
          │no
          ▼
separate (Demucs htdemucs, CPU) ─► stems: vocals, drums, bass, other
          ▼
transcribe (Basic Pitch on other, bass, vocals) ─► merge + filter ─► notes
          ▼
rhythm (librosa beat_track on mix; onset_detect on drums) ─► tempo, beats, kicks
          ▼
harmony (chroma → key via Krumhansl profiles; note grouping → chords)
          ▼
energy (RMS 10 Hz) + sections (librosa agglomerative segmentation on chroma+MFCC, labelled by repetition)
          ▼
lyrics (Muse Voice on vocals | .lrc parser | none)
          ▼
validate (pydantic AnalysisResult v1) ─► store JSON in S3 + row in `analyses`
```

Each stage updates `jobs.progress` and is a pure function `(inputs) -> outputs` so it can be tested in isolation.

## Modules (`apps/api/music_world/analysis/`, Clean Architecture — see `architecture.md` steering)

| Layer | Module | Content |
|---|---|---|
| domain | `domain/notes.py` | `Note`, `filter_notes(notes, min_dur, min_vel)` (pure) |
| domain | `domain/harmony.py` | `group_chords(notes)`, `label_chord(pitch_classes)`, `estimate_key(chroma_profile)` (pure) |
| domain | `domain/lyrics.py` | `parse_lrc(text)` (pure) |
| application | `application/ports.py` | `AudioDecoder`, `Separator`, `NoteTranscriber`, `RhythmAnalyzer`, `StructureAnalyzer`, `LyricsTranscriber`, `AnalysisRepository`, `ObjectStore`, `ProgressReporter` |
| application | `application/use_cases/analyze_project.py` | orchestrates stages, progress, resume, caching |
| infrastructure | `infrastructure/ffmpeg_decoder.py` | `decode(path) -> (samples, sr, duration)`; rejects > 180 s |
| infrastructure | `infrastructure/demucs_separator.py` | stems vocals / drums / bass / other |
| infrastructure | `infrastructure/basic_pitch_transcriber.py` | notes per stem |
| infrastructure | `infrastructure/librosa_rhythm.py`, `librosa_structure.py` | tempo, beats, kicks, chroma, energy, sections |
| infrastructure | `infrastructure/muse_lyrics.py` | Muse Voice Transcribe client |
| interfaces | `interfaces/http.py`, `interfaces/jobs.py` | `POST /api/projects`, `GET /api/projects/{id}/analysis`, arq job |

## Muse Voice Transcribe

The public API is in preview; two request styles are documented in different places (file upload vs. streamed PCM16
chunks). Task 6.1 verifies the current format before implementation. The client sends mono 16 kHz audio of the vocal
stem split on silences, and maps segment times back to song time.

## Data model

Pydantic models in `schemas/analysis.py`: `Note`, `Chord`, `EnergyPoint`, `Section`, `LyricSegment`,
`AnalysisResult` (see `PROJECT.md` §9). Beats and kicks are plain ascending `float` lists (`beats`, `kicks`; `kicks`
added for requirement 4.5, defaults to `[]`). The model validator `analysis_invariant_errors` enforces
requirement 7.2; generated TS: `AnalysisSchema` / type `Analysis`.

## Testing

- Unit tests on synthetic audio: a sine sequence C4–E4–G4 must produce three notes and one C chord when stacked.
- Hypothesis: for random note lists, `group_chords` only groups overlapping notes; `filter_notes` keeps order;
  validator invariants of Requirement 7.2 hold for any pipeline output on random short noise + tones.
- One end-to-end test on a 10 s royalty-free clip committed in `apps/api/tests/fixtures/`.

## As built (Phase 3, 2026-11-23)

- **Upload (task 2)** lives in the `projects` context: `Project` aggregate (`projects/domain/project.py`: content
  sniffing by magic bytes, 25 MB / 180 s / 64 KB `.lrc` limits), `CreateProject` and `GetProject` use cases, router
  `projects/interfaces/projects_http.py`. The project row is written before the `analyze_project` job is enqueued
  (`jobs.subject_id` = project id). Audio key `audio/<sha256>.<ext>` (content-addressed, not guessable).
- **Analysis cache**: finished results are rows of the `analyses` table (JSON, keyed by audio hash and schema id)
  instead of S3 + row; read through the analysis use case `AnalysisCache`, injected into `projects`.
- **Object storage**: `shared/object_store.py` — `S3ObjectStore` when the `S3_*` settings are complete, else
  `LocalObjectStore(STORAGE_DIR)` (no OVHcloud bucket yet; same keys, so switching is configuration only).
- The `.lrc` text is stored on the project and applied when the analysis is read (cached results stay
  lyrics-independent).
- Not yet: auth/ownership (accounts context does not exist) and per-IP upload rate limits.
- **Decode (task 3)**: `analysis/infrastructure/ffmpeg_decoder.py` writes a 44.1 kHz stereo 16-bit WAV (decoding
  1 s past the limit, so a file longer than 180 s raises `AUDIO_TOO_LONG` instead of being truncated). Upload
  already rejects long files with ffprobe; decode re-checks the real decoded length.
- **Separate (task 4)**: `analysis/infrastructure/demucs_separator.py` (htdemucs, `shifts=0` for determinism,
  `overlap=0.25`), stems written as 44.1 kHz stereo 16-bit FLAC and stored under `stems/<sha256>/<stem>.flac` by
  `AnalyzeAudio` before transcription starts. Dependency choices: `docs/decisions/001-analysis-ml-stack.md`.
  **Measured** on a 3-minute synthesized track (`scripts/synth_song.py`, 4-core i7-4750HQ, torch 2.15 CPU,
  4 threads): separation **325.7 s wall / 652 s CPU**, peak RSS **2.0 GB**; model load 79 s on first use (download
  included). Separation is ~60 % of the whole pipeline and alone takes half of the 10-minute budget on this laptop.
- **Notes (task 5)**: `analysis/infrastructure/basic_pitch_transcriber.py` runs the ONNX model on `other`, `bass`
  (30–400 Hz) and `vocals` (80–1200 Hz). Pure cleaning in `domain/notes.py`: `join_fragments` (Basic Pitch splits
  some held notes into touching pieces: same stem + pitch, gap < 30 ms → one note), `filter_notes` (≥ 50 ms,
  velocity ≥ `ANALYSIS_MIN_VELOCITY`), `fit_to_song`, then `merge_stems` (sorted by time, midi; exact duplicates
  keep the loudest; capped at 20 000 keeping the loudest). Times are rounded to 0.1 ms before sorting and chord
  grouping so stored values are the ones checked.
- **Rhythm, harmony, structure (task 7)**: `librosa_rhythm.py` (beat_track on the mix at 22.05 kHz; kicks =
  onsets of the < 150 Hz mel band of the drums stem; RMS at 10 Hz), `librosa_structure.py` (chroma_cqt profile;
  agglomerative segmentation of beat-synchronous chroma + MFCC, ~1 segment per 20 s, 2–10; segments with cosine
  similarity ≥ 0.95 share a repetition cluster). Pure: `domain/harmony.py` (`group_chords`, `label_chord` by
  interval templates with the bass as tie-break, `estimate_key` Krumhansl–Schmuckler) and `domain/structure.py`
  (`build_segments` merges < 4 s sections, `label_sections`: most-repeated cluster = chorus, next = verse,
  short unrepeated edges = intro/outro, first other unrepeated = bridge). Known limit: on the synthetic fixture
  librosa locks onto eighth-note hats (200 BPM for a 100 BPM song); beats stay on the grid, the engine pulse
  simply runs at double speed.
