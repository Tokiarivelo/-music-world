"""Ports of the analysis context (implemented in infrastructure/).

Stages exchange files (WAV/FLAC paths on the worker's disk) and plain domain dataclasses, so the application layer
never touches numpy, torch or librosa.
"""

from pathlib import Path
from typing import Protocol

from music_world.analysis.domain.audio import DecodedAudio
from music_world.schemas.analysis import AnalysisResult


class AudioDecoder(Protocol):
    """Decodes any accepted upload to a 44.1 kHz stereo WAV; raises `AudioDecodeError` / `AudioTooLongError`."""

    async def decode(self, source: Path, target: Path) -> DecodedAudio: ...


class AnalysisRepository(Protocol):
    """Finished analyses, keyed by audio hash (the cache of requirement 1.4)."""

    async def exists(self, audio_hash: str) -> bool: ...
    async def get(self, audio_hash: str) -> AnalysisResult | None: ...
    async def save(self, result: AnalysisResult) -> None: ...
