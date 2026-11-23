"""Lyrics transcriber used while Muse Voice is not available (task 6.1 pending): no transcription, `lyricsSource`
stays `none` unless the user uploaded an `.lrc`."""

from pathlib import Path

from music_world.analysis.domain.lyrics import LyricLine


class NoLyricsTranscriber:
    async def transcribe(self, vocals: Path, duration_sec: float) -> list[LyricLine]:
        return []
