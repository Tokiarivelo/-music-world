"""On-demand lyrics search for an analysed project (the "Search lyrics" button): the online catalog first, then speech
recognition on the vocal stem, then the analysis is updated so the lyrics are mapped to the song's timeline."""

import json
import tempfile
from pathlib import Path

import structlog

from music_world.analysis.application.lyrics_finder import LyricsFinder
from music_world.analysis.application.ports import AnalysisRepository, ObjectStore, ProjectAudioSource
from music_world.analysis.application.use_cases.analyze_audio import stem_key
from music_world.analysis.domain.errors import AnalysisNotReadyError
from music_world.schemas.analysis import AnalysisResult

_ROUND = 4
_MAX_FIELD = 200
log = structlog.get_logger(__name__)


def query_key(audio_hash: str) -> str:
    """Where the artist and title typed by the listener wait for the job (the file may carry no tags)."""
    return f"work/{audio_hash.removeprefix('sha256:')}/lyrics-query.json"


async def save_query(store: ObjectStore, audio_hash: str, artist: str, title: str) -> None:
    body = json.dumps({"artist": artist.strip()[:_MAX_FIELD], "title": title.strip()[:_MAX_FIELD]})
    await store.put_bytes(query_key(audio_hash), body.encode(), "application/json")


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
        artist, title = await self._query(audio.audio_hash)
        with tempfile.TemporaryDirectory(prefix="mw-lyrics-") as tmp:
            source, vocals = Path(tmp) / "source", Path(tmp) / "vocals.flac"
            await self._store.get_file(audio.audio_key, source)
            # Without the vocal stem the online catalog can still answer; only speech recognition needs it.
            has_vocals = await self._store.get_file(stem_key(audio.audio_hash, "vocals"), vocals)
            lines, name = await self._finder.find(
                audio.audio_hash, source, vocals, result.duration_sec, artist, title, allow_asr=has_vocals
            )
        log.info("analysis.lyrics_search", source=name, lines=len(lines), vocals=has_vocals, typed=artist is not None)
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

    async def _query(self, audio_hash: str) -> tuple[str | None, str | None]:
        raw = await self._store.get_bytes(query_key(audio_hash))
        if raw is None:
            return None, None
        try:
            data = json.loads(raw)
            artist, title = str(data.get("artist", "")).strip(), str(data.get("title", "")).strip()
        except (ValueError, AttributeError):
            return None, None
        return (artist, title) if artist and title else (None, None)
