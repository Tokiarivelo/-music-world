"""Artist and title from the audio file's own tags (ffprobe), used to look the lyrics up online."""

import asyncio
import json
from pathlib import Path

_TIMEOUT_SECONDS = 10


class FfprobeTagReader:
    def __init__(self, binary: str = "ffprobe") -> None:
        self._binary = binary

    async def read(self, audio: Path) -> tuple[str, str] | None:
        try:
            proc = await asyncio.create_subprocess_exec(
                self._binary, "-v", "error", "-show_entries", "format_tags=artist,title", "-of", "json", str(audio),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            )  # fmt: skip
            out, _ = await asyncio.wait_for(proc.communicate(), _TIMEOUT_SECONDS)
            tags = json.loads(out or b"{}").get("format", {}).get("tags", {})
        except (OSError, TimeoutError, ValueError):
            return None
        lowered = {str(k).lower(): str(v).strip() for k, v in tags.items()}
        artist, title = lowered.get("artist", ""), lowered.get("title", "")
        return (artist[:200], title[:200]) if artist and title else None
