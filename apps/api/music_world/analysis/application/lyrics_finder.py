"""Lyrics of a song that has no user .lrc: the online catalog first, then speech recognition on the vocal stem.

Shared by the analysis pipeline and the on-demand "search lyrics" job. The outcome is cached with the work files, so
asking again neither queries the catalog nor transcribes again. The text is never logged.
"""

import json
from collections.abc import Sequence
from dataclasses import asdict
from pathlib import Path
from typing import Any

from music_world.analysis.application.ports import LyricsLookup, LyricsTranscriber, ObjectStore, TagReader
from music_world.analysis.domain.lyrics import (
    LyricLine,
    fit_lyrics,
    guess_artist_title,
    is_plausible_lyrics,
    stretch_lyrics,
)

JSON_CONTENT_TYPE = "application/json"


def work_key(audio_hash: str, name: str) -> str:
    return f"work/{audio_hash.removeprefix('sha256:')}/{name}.json"


# Written at upload by the projects context (same key format): the uploaded file's name, a last-resort query.
NAME_HINT = "name-hint"


class LyricsFinder:
    def __init__(
        self, store: ObjectStore, lookup: LyricsLookup | None, tags: TagReader | None, transcriber: LyricsTranscriber
    ) -> None:
        self._store, self._lookup, self._tags, self._transcriber = store, lookup, tags, transcriber

    async def find(
        self,
        audio_hash: str,
        source: Path,
        vocals: Path,
        duration: float,
        artist: str | None = None,
        title: str | None = None,
        *,
        allow_asr: bool = True,
    ) -> tuple[list[LyricLine], str]:
        """`(lines, source)` with source `lrclib`, `whisper` or `none`."""
        key = work_key(audio_hash, "lyrics")
        saved = await self._load(key)
        typed = bool(artist and title)
        # A cached "none" is final only when nothing new can change it: no typed query and no speech recognition left.
        if saved is not None and (saved["source"] != "none" or (not allow_asr and not typed)):
            return [LyricLine(**line) for line in saved["lines"]], str(saved["source"])
        instrumental = False
        if self._lookup is not None:
            query = (artist, title) if artist and title else None
            if query is None and self._tags is not None:
                query = await self._tags.read(source)
            if query is None:
                query = await self._name_guess(audio_hash)
            if query is not None:
                found = await self._lookup.find(query[0], query[1], duration)
                if found is not None and found.instrumental:
                    instrumental = True
                elif found is not None and is_plausible_lyrics(found.lines, duration):
                    shifted = list(found.lines)
                    if found.duration and found.duration > 0:  # another cut of the song: stretch to this audio
                        shifted = stretch_lyrics(shifted, duration / found.duration)
                    lines = fit_lyrics(shifted, duration)
                    await self._save(key, "lrclib", lines)
                    return lines, "lrclib"
        if instrumental or not allow_asr:
            return [], "none"
        lines = fit_lyrics(await self._transcriber.transcribe(vocals, duration), duration)
        name = "whisper" if lines else "none"
        await self._save(key, name, lines)
        return lines, name

    async def _name_guess(self, audio_hash: str) -> tuple[str, str] | None:
        raw = await self._store.get_bytes(work_key(audio_hash, NAME_HINT))
        if raw is None:
            return None
        try:
            return guess_artist_title(str(json.loads(raw).get("name", "")))
        except (ValueError, AttributeError):
            return None

    async def _load(self, key: str) -> dict[str, Any] | None:
        raw = await self._store.get_bytes(key)
        loaded: dict[str, Any] | None = json.loads(raw) if raw is not None else None
        return loaded

    async def _save(self, key: str, source: str, lines: Sequence[LyricLine]) -> None:
        payload = {"source": source, "lines": [asdict(line) for line in lines]}
        await self._store.put_bytes(key, json.dumps(payload).encode(), JSON_CONTENT_TYPE)
