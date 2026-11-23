import pytest

from music_world.analysis.application.ports import ProjectAudio
from music_world.analysis.application.use_cases.get_project_analysis import GetProjectAnalysis
from music_world.analysis.domain.errors import AnalysisNotReadyError
from music_world.schemas.analysis import AnalysisResult
from tests.fakes import InMemoryAnalysisRepository
from tests.unit.test_analysis_schema import HASH, _base


class Projects:
    def __init__(self, lrc: str | None) -> None:
        self.lrc = lrc

    async def get(self, project_id: str) -> ProjectAudio:
        return ProjectAudio(HASH, "audio/x.wav", self.lrc)


async def _use_case(lrc: str | None, cached: bool = True) -> GetProjectAnalysis:
    repo = InMemoryAnalysisRepository()
    if cached:
        await repo.save(AnalysisResult.model_validate(_base()))
    return GetProjectAnalysis(Projects(lrc), repo)


async def test_user_lrc_replaces_lyrics_and_is_clamped_to_the_song() -> None:
    result = await (await _use_case("[00:01.00]hello\n[00:09.00]last words")).execute("p")
    assert result.lyrics_source == "lrc"
    assert [(s.start, s.end, s.text) for s in result.lyrics] == [(1.0, 9.0, "hello"), (9.0, 10.0, "last words")]


async def test_without_or_with_an_unusable_lrc_the_cached_analysis_is_returned() -> None:
    for lrc in (None, "no timestamps here", "[00:30.00]after the end"):
        result = await (await _use_case(lrc)).execute("p")
        assert result.lyrics == [] and result.lyrics_source == "none"


async def test_not_ready_until_cached() -> None:
    with pytest.raises(AnalysisNotReadyError):
        await (await _use_case(None, cached=False)).execute("p")
