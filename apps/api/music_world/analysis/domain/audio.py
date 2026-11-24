"""Decoded audio handed from stage to stage (files on the worker's disk, never raw arrays in the domain)."""

from dataclasses import dataclass
from pathlib import Path

# Only the first five minutes of a song are analysed (decoder cut); the rest plays with generic notes in the world.
MAX_ANALYZED_MINUTES = 5
MAX_DURATION_SEC = MAX_ANALYZED_MINUTES * 60.0
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
