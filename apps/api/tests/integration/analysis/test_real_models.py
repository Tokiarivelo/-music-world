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
