"""Rhythm stage with librosa (ISC): tempo + beats on the mix, kick onsets on the drums stem, RMS energy at 10 Hz."""

import asyncio
import time
from pathlib import Path

import librosa
import numpy as np
import structlog

from music_world.analysis.application.ports import Rhythm
from music_world.analysis.domain.structure import ENERGY_RATE_HZ

log = structlog.get_logger(__name__)

SAMPLE_RATE = 22050
HOP = 512
# Kicks: onsets of the low band (< 150 Hz) of the drums stem.
KICK_MAX_HZ = 150.0


def _load(path: Path) -> np.ndarray:
    y, _ = librosa.load(str(path), sr=SAMPLE_RATE, mono=True)
    return np.asarray(y, dtype=np.float32)


def _kicks(drums: np.ndarray) -> list[float]:
    if not np.any(drums):
        return []
    mel = librosa.feature.melspectrogram(y=drums, sr=SAMPLE_RATE, hop_length=HOP, n_mels=64, fmax=KICK_MAX_HZ * 4)
    freqs = librosa.mel_frequencies(n_mels=64, fmax=KICK_MAX_HZ * 4)
    low = librosa.power_to_db(mel[freqs <= KICK_MAX_HZ])
    envelope = librosa.onset.onset_strength(S=low, sr=SAMPLE_RATE, hop_length=HOP)
    onsets = librosa.onset.onset_detect(
        onset_envelope=envelope, sr=SAMPLE_RATE, hop_length=HOP, units="time", backtrack=False
    )
    return [float(t) for t in onsets]


def _analyze(mix: Path, drums: Path | None) -> Rhythm:
    y = _load(mix)
    if np.any(y):
        tempo, beats = librosa.beat.beat_track(y=y, sr=SAMPLE_RATE, hop_length=HOP, units="time")
        tempo_bpm = float(np.atleast_1d(tempo)[0])
    else:
        tempo_bpm, beats = 0.0, np.array([])
    hop_energy = SAMPLE_RATE // ENERGY_RATE_HZ
    rms = librosa.feature.rms(y=y, frame_length=hop_energy * 2, hop_length=hop_energy, center=True)[0]
    kicks = _kicks(_load(drums)) if drums is not None else []
    return Rhythm(
        tempo_bpm=tempo_bpm,
        beats=tuple(float(b) for b in beats),
        kicks=tuple(kicks),
        rms=tuple(float(v) for v in rms),
    )


class LibrosaRhythmAnalyzer:
    async def analyze(self, mix: Path, drums: Path | None) -> Rhythm:
        started = time.process_time()
        rhythm = await asyncio.to_thread(_analyze, mix, drums)
        log.info("analysis.stage_done", stage="rhythm", beats=len(rhythm.beats), kicks=len(rhythm.kicks),
                 cpu_sec=round(time.process_time() - started, 2))  # fmt: skip
        return rhythm
