"""Decode stage: ffmpeg → 44.1 kHz stereo 16-bit WAV (the mix every later stage reads)."""

import asyncio
import time
import wave
from pathlib import Path

import structlog

from music_world.analysis.domain.audio import (
    MAX_DURATION_SEC,
    MIX_CHANNELS,
    MIX_SAMPLE_RATE,
    DecodedAudio,
    check_duration,
)
from music_world.analysis.domain.errors import AudioDecodeError

log = structlog.get_logger(__name__)

FFMPEG_TIMEOUT_SECONDS = 120
# Decode slightly past the limit so an over-long file is detected instead of silently truncated.
_DECODE_LIMIT_SEC = MAX_DURATION_SEC + 1


class FfmpegDecoder:
    def __init__(self, binary: str = "ffmpeg") -> None:
        self._binary = binary

    async def decode(self, source: Path, target: Path) -> DecodedAudio:
        started = time.process_time()
        target.parent.mkdir(parents=True, exist_ok=True)
        proc = await asyncio.create_subprocess_exec(
            self._binary, "-nostdin", "-v", "error", "-y",
            "-i", str(source),
            "-t", str(_DECODE_LIMIT_SEC),
            "-vn", "-ac", str(MIX_CHANNELS), "-ar", str(MIX_SAMPLE_RATE),
            "-acodec", "pcm_s16le", "-f", "wav", str(target),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )  # fmt: skip
        try:
            _, err = await asyncio.wait_for(proc.communicate(), FFMPEG_TIMEOUT_SECONDS)
        except TimeoutError as error:
            proc.kill()
            raise AudioDecodeError("audio decoding timed out") from error
        if proc.returncode != 0 or not target.is_file():
            log.warning("analysis.decode_failed", returncode=proc.returncode, stderr_bytes=len(err))
            raise AudioDecodeError("audio file could not be decoded")
        try:
            with wave.open(str(target), "rb") as w:
                frames, rate, channels = w.getnframes(), w.getframerate(), w.getnchannels()
        except (wave.Error, EOFError) as error:
            raise AudioDecodeError("audio file could not be decoded") from error
        duration = frames / rate
        if frames == 0:
            raise AudioDecodeError("audio file contains no samples")
        check_duration(duration)
        log.info("analysis.stage_done", stage="decode", duration_sec=round(duration, 3),
                 cpu_sec=round(time.process_time() - started, 3))  # fmt: skip
        return DecodedAudio(target, rate, channels, duration)
