# Requirements Document

## Introduction

Turn an uploaded audio file into a versioned `AnalysisResult`: timed notes, chords, tempo and beats, key, energy curve,
sections and lyrics. Analysis runs in the Python worker. Notes come from signal processing (Basic Pitch on Demucs
stems), never from an LLM. Lyrics come from Muse Voice Transcribe on the vocal stem, from a user `.lrc` file, or are
marked absent.

## Requirements

### Requirement 1 — Upload

**User Story:** As a user, I want to upload a song and follow its analysis progress.

#### Acceptance Criteria

1. WHEN a user uploads MP3, WAV or FLAC up to 25 MB and 3 minutes THEN the system SHALL store it in object storage,
   create a project and enqueue an analysis job.
2. IF the file is another format, too large or longer than 3 minutes THEN the system SHALL reject it with a clear error.
3. WHILE the job runs THE system SHALL report progress per stage (decode, separate, transcribe, rhythm, harmony, lyrics).
4. WHEN the same audio (same SHA-256) is uploaded again THEN the system SHALL reuse the cached `AnalysisResult`.
5. WHERE a user also uploads a `.lrc` file THE system SHALL use it for lyrics instead of transcription.

### Requirement 2 — Source separation

1. THE worker SHALL separate the audio into `vocals`, `drums`, `bass` and `other` stems with Demucs (htdemucs, CPU).
2. Stems SHALL be stored in object storage and referenced by the project.

### Requirement 3 — Notes

1. THE worker SHALL transcribe notes with Basic Pitch on the `other`, `bass` and `vocals` stems.
2. Each note SHALL have `id`, `time`, `duration > 0`, `midi` (0–127), `velocity` (0–1) and `stem`.
3. THE worker SHALL drop notes shorter than 50 ms or with velocity below a configurable threshold.
4. Notes SHALL be sorted by `time`, then `midi`.

### Requirement 4 — Rhythm, key, energy, sections

1. THE worker SHALL estimate tempo (BPM) and beat times with librosa on the full mix.
2. THE worker SHALL estimate the key (e.g. `A minor`) from the chroma profile.
3. THE worker SHALL compute an RMS energy curve sampled at 10 Hz, normalised to 0–1.
4. THE worker SHALL segment the song into sections with start, end and a label (`intro`, `verse`, `chorus`, `bridge`,
   `outro` or `section_<n>`).
5. THE worker SHALL detect kick onsets on the `drums` stem.

### Requirement 5 — Chords

1. THE worker SHALL group notes that start within 60 ms of each other and overlap in time into chords of ≥ 3 distinct
   pitch classes.
2. Each chord SHALL have a label (`C`, `Am`, `G7`, …) or `N.C.` when unknown, and reference its note ids.

### Requirement 6 — Lyrics

1. WHERE `LYRICS_PROVIDER=muse` and the vocal stem has energy above a threshold THE worker SHALL transcribe it with
   Muse Voice Transcribe and store timed segments.
2. IF transcription fails or returns empty text THEN `lyrics` SHALL be empty and `lyricsSource` SHALL be `none`.
3. THE system SHALL NOT log full lyrics.

### Requirement 7 — Result contract

1. THE result SHALL validate against `music-world.analysis.v1`.
2. FOR ALL valid results: notes are sorted, every chord's note ids exist, every time is within `[0, durationSec]`,
   sections are contiguous and cover the song.
