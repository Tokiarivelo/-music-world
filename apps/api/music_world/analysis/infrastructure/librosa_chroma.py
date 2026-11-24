"""Chroma stage: pitch-class energy of the mix over time (librosa CQT chroma), used to verify the transcribed notes."""

import asyncio
from pathlib import Path

import librosa
import numpy as np

from music_world.analysis.domain.notes import Chroma

SAMPLE_RATE = 22050
HOP = 512


def _analyze(mix: Path) -> Chroma:
    y, _ = librosa.load(str(mix), sr=SAMPLE_RATE, mono=True)
    if not np.any(y):
        return Chroma(HOP / SAMPLE_RATE, ())
    # Per-frame max normalisation: a frame is a relative profile, so a loud and a quiet passage weigh the same.
    chroma = librosa.feature.chroma_cqt(y=y, sr=SAMPLE_RATE, hop_length=HOP, norm=np.inf)
    return Chroma(HOP / SAMPLE_RATE, tuple(tuple(float(v) for v in frame) for frame in chroma.T))


class LibrosaChromaAnalyzer:
    async def analyze(self, mix: Path) -> Chroma:
        return await asyncio.to_thread(_analyze, mix)
