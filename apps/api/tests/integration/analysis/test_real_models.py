"""Real Demucs / Basic Pitch / librosa on short self-made audio (`@pytest.mark.slow`: run with `-m slow`)."""

import shutil
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from music_world.analysis.domain.audio import STEMS
from music_world.analysis.domain.harmony import group_chords
from music_world.analysis.domain.notes import clean_notes
from music_world.analysis.infrastructure.basic_pitch_transcriber import BasicPitchTranscriber
from music_world.analysis.infrastructure.demucs_separator import DemucsSeparator
from music_world.analysis.infrastructure.ffmpeg_decoder import FfmpegDecoder

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "synth-song-10s.flac"

pytestmark = [pytest.mark.slow, pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")]


def tones(path: Path, notes: list[tuple[float, float, int]], seconds: float, sr: int = 22050) -> None:
    """Sum of harmonic tones `(start, duration, midi)`."""
    y = np.zeros(int(seconds * sr))
    for start, dur, midi in notes:
        t = np.arange(int(dur * sr)) / sr
        f = 440 * 2 ** ((midi - 69) / 12)
        wave = sum(np.sin(2 * np.pi * f * (h + 1) * t) / (h + 1) for h in range(3)) * np.minimum(1, (dur - t) / 0.05)
        i = int(start * sr)
        y[i : i + t.size] += wave
    sf.write(str(path), (0.3 * y / np.abs(y).max()).astype(np.float32), sr)


async def test_basic_pitch_finds_c_e_g_as_three_notes_then_one_c_chord(tmp_path: Path) -> None:
    seq, stacked = tmp_path / "seq.wav", tmp_path / "stacked.wav"
    tones(seq, [(0.5, 0.6, 60), (1.5, 0.6, 64), (2.5, 0.6, 67)], 3.5)
    tones(stacked, [(0.5, 1.5, 60), (0.5, 1.5, 64), (0.5, 1.5, 67)], 2.5)
    transcriber = BasicPitchTranscriber()
    found = clean_notes(await transcriber.transcribe(seq, "other"), 0.25, 3.5)
    assert [n.midi for n in found] == [60, 64, 67]
    for note, onset in zip(found, (0.5, 1.5, 2.5), strict=True):
        assert abs(note.time - onset) < 0.06
    chord_notes = clean_notes(await transcriber.transcribe(stacked, "other"), 0.25, 2.5)
    chords = group_chords(chord_notes)
    assert [c.label for c in chords] == ["C"]


async def test_demucs_splits_the_fixture_into_four_full_length_stems(tmp_path: Path) -> None:
    mix = await FfmpegDecoder().decode(FIXTURE, tmp_path / "mix.wav")
    stems = await DemucsSeparator().separate(mix, tmp_path / "stems")
    assert sorted(stems) == sorted(STEMS)
    for path in stems.values():
        info = sf.info(str(path))
        assert info.samplerate == 44100 and info.channels == 2 and abs(info.duration - mix.duration_sec) < 0.01
    drums, _ = sf.read(str(stems["drums"]))
    bass, _ = sf.read(str(stems["bass"]))
    assert np.abs(drums).max() > 0.05 and np.abs(bass).max() > 0.05


async def test_full_pipeline_on_the_fixture_gives_a_valid_musical_analysis(tmp_path: Path) -> None:
    """End to end (design.md § Testing): decode → Demucs → Basic Pitch → librosa → validated result."""
    import hashlib

    from music_world.analysis.application.use_cases.analyze_audio import AnalyzeAudio, AnalyzeAudioInput, stem_key
    from music_world.analysis.infrastructure.librosa_rhythm import LibrosaRhythmAnalyzer
    from music_world.analysis.infrastructure.librosa_structure import LibrosaStructureAnalyzer
    from music_world.analysis.infrastructure.null_lyrics import NoLyricsTranscriber
    from music_world.shared.object_store import LocalObjectStore
    from tests.fakes import InMemoryAnalysisRepository

    digest = "sha256:" + hashlib.sha256(FIXTURE.read_bytes()).hexdigest()
    store, repo = LocalObjectStore(tmp_path / "store"), InMemoryAnalysisRepository()
    await store.put_file("audio/fixture.flac", FIXTURE, "audio/flac")
    use_case = AnalyzeAudio(
        repo, store, FfmpegDecoder(), DemucsSeparator(), BasicPitchTranscriber(), LibrosaRhythmAnalyzer(),
        LibrosaStructureAnalyzer(), NoLyricsTranscriber(), min_velocity=0.25,
    )  # fmt: skip
    stages: list[str | None] = []

    async def report(progress: float, stage: str | None = None) -> None:
        stages.append(stage)

    result = await use_case.execute(AnalyzeAudioInput(digest, "audio/fixture.flac"), report)
    assert await repo.get(digest) == result and len(stages) == 8
    assert all([await store.exists(stem_key(digest, s)) for s in STEMS])
    assert result.key in ("A minor", "C major") and abs(result.duration_sec - 10.0) < 0.01
    assert len(result.notes) >= 20 and result.beats and result.kicks
    # Bass notes follow the progression roots A, F, C, G.
    bass = [n.midi % 12 for n in result.notes if n.stem == "bass"]
    assert bass and sum(pc in (9, 5, 0, 7) for pc in bass) >= 0.8 * len(bass)
    # Determinism: the same audio analysed again from scratch (fresh store, no checkpoints) gives the same result.
    fresh = LocalObjectStore(tmp_path / "store2")
    await fresh.put_file("audio/fixture.flac", FIXTURE, "audio/flac")
    repo.results.clear()
    again = await AnalyzeAudio(
        repo, fresh, FfmpegDecoder(), DemucsSeparator(), BasicPitchTranscriber(), LibrosaRhythmAnalyzer(),
        LibrosaStructureAnalyzer(), NoLyricsTranscriber(), min_velocity=0.25,
    ).execute(AnalyzeAudioInput(digest, "audio/fixture.flac"), report)  # fmt: skip
    assert again == result
