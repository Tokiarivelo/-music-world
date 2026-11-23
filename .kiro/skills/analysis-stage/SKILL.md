---
name: analysis-stage
description: Add or change a stage of the Music World audio analysis pipeline (decode, Demucs separation, Basic Pitch notes, librosa rhythm/key/energy/sections, chords, lyrics via Muse Voice or .lrc) while keeping AnalysisResult valid, jobs resumable and CPU budget under control. Use for any change in apps/api/music_world/analysis.
---

# Analysis stage

Rules: `architecture.md`, `tech.md` (rule 1: algorithms detect notes, never an LLM). Spec: `02-music-analysis`.

1. **Port**: declare or reuse the stage port in `analysis/application/ports.py`
   (`Separator`, `NoteTranscriber`, `RhythmAnalyzer`, `StructureAnalyzer`, `LyricsTranscriber`…).
2. **Pure logic in domain**: anything that does not need an SDK (filtering notes, grouping chords, labelling,
   parsing `.lrc`, section labelling) goes to `analysis/domain/` and gets Hypothesis tests.
3. **Adapter**: implement the port in `analysis/infrastructure/<lib>_<role>.py`. Models are loaded once per worker
   process (module-level lazy singleton), never per job. CPU only; log stage duration.
4. **Orchestration**: register the stage in `AnalyzeProject` with a stage name, a progress weight and persistence of
   its output (so a crashed job resumes after the last finished stage). Update the stage list used by the web
   progress bar (`features/upload/consts`).
5. **Contract**: if `AnalysisResult` changes, edit `schemas/analysis.py`, bump `music-world.analysis.vN` if breaking,
   `make schemas`, update fixtures and `PROJECT.md` §9.
6. **Invariants** (property tests on any pipeline output): notes sorted by (time, midi); duration > 0; times within
   `[0, durationSec]`; chord note ids exist and overlap in time; sections contiguous and covering the song.
7. **Budget**: measure the stage on the 3-minute reference track; record the time in the spec `design.md`. Total
   analysis must stay under 10 minutes on the OVHcloud instance.
8. **Lyrics specifics**: run Muse Voice only on the vocal stem when its energy is above threshold; never log full
   text; `.lrc` from the user always wins; failure → `lyricsSource: "none"`.
9. Test: `cd apps/api && uv run pytest tests -k analysis -m "not slow"`; run the slow test once on the fixture.
