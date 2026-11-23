"""Audio duration from the file content with ffprobe (fast: reads headers, no decoding)."""

import asyncio
import json
from pathlib import Path

from music_world.projects.domain.errors import AudioUnreadableError

FFPROBE_TIMEOUT_SECONDS = 20


class FfprobeAudioProbe:
    def __init__(self, binary: str = "ffprobe") -> None:
        self._binary = binary

    async def duration(self, path: Path) -> float:
        proc = await asyncio.create_subprocess_exec(
            self._binary,
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json",
            str(path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )  # fmt: skip
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), FFPROBE_TIMEOUT_SECONDS)
        except TimeoutError as error:
            proc.kill()
            raise AudioUnreadableError("audio file could not be read") from error
        try:
            duration = float(json.loads(out)["format"]["duration"])
        except (ValueError, KeyError, TypeError) as error:
            raise AudioUnreadableError("audio file could not be read") from error
        if proc.returncode != 0 or duration <= 0:
            raise AudioUnreadableError("audio file could not be read")
        return duration
