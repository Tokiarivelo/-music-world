from music_world.analysis.application.ports import AnalysisRepository
from music_world.schemas.analysis import AnalysisResult


class AnalysisCache:
    """Read side of the analysis cache, injected into other contexts (projects asks `exists` on upload)."""

    def __init__(self, repo: AnalysisRepository) -> None:
        self._repo = repo

    async def exists(self, audio_hash: str) -> bool:
        return await self._repo.exists(audio_hash)

    async def get(self, audio_hash: str) -> AnalysisResult | None:
        return await self._repo.get(audio_hash)
