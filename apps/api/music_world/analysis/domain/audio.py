"""Decoded audio handed from stage to stage (files on the worker's disk, never raw arrays in the domain)."""

from dataclasses import dataclass
from pathlib import Path

from music_world.analysis.domain.errors import AudioTooLongError

MAX_DURATION_SEC = 180.0
# Demucs htdemucs works at 44.1 kHz stereo; every stage reads this mix.
MIX_SAMPLE_RATE = 44100
MIX_CHANNELS = 2

STEMS = ("vocals", "drums", "bass", "other")
# Requirement 3.1: stems that carry pitched notes.
PITCHED_STEMS = ("other", "bass", "vocals")


@dataclass(frozen=True)
class DecodedAudio:
    path: Path
    sample_rate: int
    channels: int
    duration_sec: float


def check_duration(duration_sec: float) -> None:
    if duration_sec > MAX_DURATION_SEC:
        raise AudioTooLongError(f"audio is longer than {MAX_DURATION_SEC:.0f} seconds")
