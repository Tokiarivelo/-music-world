"""Ports of the analysis context (implemented in infrastructure/)."""

from typing import Protocol

from music_world.schemas.analysis import AnalysisResult


class AnalysisRepository(Protocol):
    """Finished analyses, keyed by audio hash (the cache of requirement 1.4)."""

    async def exists(self, audio_hash: str) -> bool: ...
    async def get(self, audio_hash: str) -> AnalysisResult | None: ...
    async def save(self, result: AnalysisResult) -> None: ...
