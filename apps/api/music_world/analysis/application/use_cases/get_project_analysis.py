from music_world.analysis.application.ports import AnalysisRepository, ProjectAudioSource
from music_world.analysis.domain.errors import AnalysisNotReadyError
from music_world.analysis.domain.lyrics import fit_lyrics, parse_lrc
from music_world.schemas.analysis import AnalysisResult

_ROUND = 4


class GetProjectAnalysis:
    """The cached analysis of a project's audio (`ANALYSIS_NOT_READY` while the job runs).

    The cache is keyed by audio only; a user `.lrc` (requirement 1.5) is applied here and always wins over
    transcribed lyrics. An `.lrc` without any usable timed line leaves the analysis unchanged.
    """

    def __init__(self, projects: ProjectAudioSource, repo: AnalysisRepository) -> None:
        self._projects, self._repo = projects, repo

    async def execute(self, project_id: str) -> AnalysisResult:
        audio = await self._projects.get(project_id)
        result = await self._repo.get(audio.audio_hash)
        if result is None:
            raise AnalysisNotReadyError("the analysis of this project is not ready yet")
        if audio.lrc_text is None:
            return result
        lines = fit_lyrics(parse_lrc(audio.lrc_text), result.duration_sec)
        if not lines:
            return result
        doc = result.model_dump(by_alias=True)
        doc["lyrics"] = [
            {"start": round(line.start, _ROUND), "end": round(line.end, _ROUND), "text": line.text} for line in lines
        ]
        doc["lyricsSource"] = "lrc"
        return AnalysisResult.model_validate(doc)
