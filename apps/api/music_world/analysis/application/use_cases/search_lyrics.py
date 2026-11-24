"""On-demand lyrics search for an analysed project (the "Search lyrics" button): the online catalog first, then speech
recognition on the vocal stem, then the analysis is updated so the lyrics are mapped to the song's timeline."""

import tempfile
from pathlib import Path

from music_world.analysis.application.lyrics_finder import LyricsFinder
from music_world.analysis.application.ports import AnalysisRepository, ObjectStore, ProjectAudioSource
from music_world.analysis.application.use_cases.analyze_audio import stem_key
from music_world.analysis.domain.errors import AnalysisNotReadyError
from music_world.schemas.analysis import AnalysisResult

_ROUND = 4


class SearchLyrics:
    def __init__(
        self, projects: ProjectAudioSource, repo: AnalysisRepository, store: ObjectStore, finder: LyricsFinder
    ) -> None:
        self._projects, self._repo, self._store, self._finder = projects, repo, store, finder

    async def execute(self, project_id: str) -> int:
        """Number of lyric lines now in the analysis (0 when nothing was found: the analysis is left unchanged)."""
        audio = await self._projects.get(project_id)
        result = await self._repo.get(audio.audio_hash)
        if result is None:
            raise AnalysisNotReadyError("the analysis is not ready yet")
        with tempfile.TemporaryDirectory(prefix="mw-lyrics-") as tmp:
            source, vocals = Path(tmp) / "source", Path(tmp) / "vocals.flac"
            await self._store.get_file(audio.audio_key, source)
            if not await self._store.get_file(stem_key(audio.audio_hash, "vocals"), vocals):
                return 0
            lines, name = await self._finder.find(audio.audio_hash, source, vocals, result.duration_sec)
        if not lines:
            return 0
        doc = result.model_dump(mode="json", by_alias=True)
        doc["lyrics"] = [
            {
                "start": round(line.start, _ROUND),
                "end": round(min(line.end, result.duration_sec), _ROUND),
                "text": line.text[:500],
            }
            for line in sorted(lines, key=lambda line: line.start)
        ]
        doc["lyricsSource"] = name
        await self._repo.save(AnalysisResult.model_validate(doc))
        return len(lines)
