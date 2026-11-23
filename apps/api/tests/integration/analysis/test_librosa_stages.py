"""librosa rhythm and structure stages on the self-made 10 s fixture (Am–F–C–G at 100 BPM, kick on beats 1 and 3)."""

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from music_world.analysis.domain.harmony import estimate_key
from music_world.analysis.domain.structure import build_segments, label_sections, normalize_energy
from music_world.analysis.infrastructure.librosa_rhythm import LibrosaRhythmAnalyzer
from music_world.analysis.infrastructure.librosa_structure import LibrosaStructureAnalyzer

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "synth-song-10s.flac"
BEAT = 0.6  # 100 BPM


async def test_tempo_beats_kicks_and_energy() -> None:
    rhythm = await LibrosaRhythmAnalyzer().analyze(FIXTURE, FIXTURE)
    assert 95 <= rhythm.tempo_bpm <= 105 or 190 <= rhythm.tempo_bpm <= 210
    assert len(rhythm.beats) >= 10 and list(rhythm.beats) == sorted(rhythm.beats)
    # Beats fall on the song's grid at the detected metrical level (100 BPM, or 200 when the eighth-note hats win:
    # a librosa octave error the engine tolerates — the beat pulse just runs at double speed).
    period = BEAT if rhythm.tempo_bpm < 150 else BEAT / 2
    assert np.median([abs(b / period - round(b / period)) * period for b in rhythm.beats]) < 0.07
    # Kicks every 1.2 s: most expected kicks have a detected onset close by.
    expected = np.arange(0, 10, 2 * BEAT)
    hits = sum(any(abs(k - e) < 0.08 for k in rhythm.kicks) for e in expected)
    assert hits >= 0.7 * len(expected)
    energy = normalize_energy(rhythm.rms, 10.0)
    assert len(energy) in (100, 101) and max(e.value for e in energy) == 1.0


async def test_key_and_sections_of_the_fixture() -> None:
    structure = await LibrosaStructureAnalyzer().analyze(FIXTURE)
    assert len(structure.chroma_profile) == 12
    assert estimate_key(structure.chroma_profile) in ("A minor", "C major")
    assert len(structure.clusters) == len(structure.boundaries) + 1
    sections = label_sections(build_segments(structure.boundaries, structure.clusters, 10.0), 10.0)
    assert sections[0].start == 0 and sections[-1].end == 10.0


async def test_silence_gives_zero_tempo_no_kicks_and_unknown_key(tmp_path: Path) -> None:
    silent = tmp_path / "silence.wav"
    sf.write(str(silent), np.zeros(22050 * 3, dtype=np.float32), 22050)
    rhythm = await LibrosaRhythmAnalyzer().analyze(silent, silent)
    assert rhythm.tempo_bpm == 0 and rhythm.beats == () and rhythm.kicks == ()
    structure = await LibrosaStructureAnalyzer().analyze(silent)
    assert estimate_key(structure.chroma_profile) == "unknown"


@pytest.mark.parametrize("seconds", [0.5])
async def test_very_short_audio_does_not_crash(tmp_path: Path, seconds: float) -> None:
    short = tmp_path / "short.wav"
    t = np.arange(int(22050 * seconds)) / 22050
    sf.write(str(short), (0.3 * np.sin(2 * np.pi * 440 * t)).astype(np.float32), 22050)
    await LibrosaRhythmAnalyzer().analyze(short, None)
    structure = await LibrosaStructureAnalyzer().analyze(short)
    assert len(structure.clusters) == len(structure.boundaries) + 1
