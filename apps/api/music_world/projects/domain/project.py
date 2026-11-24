"""Project aggregate: one uploaded song (audio + optional `.lrc`) and the job that analyses it.

The analysis itself is cached by audio hash in the analysis context; a project only references it.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Literal

from music_world.projects.domain.errors import (
    AudioFormatUnsupportedError,
    AudioTooLargeError,
    AudioTooLongError,
    LyricsFileInvalidError,
)

# Requirement 1.1 / 1.2 limits.
MAX_AUDIO_BYTES = 25 * 1024 * 1024
MAX_AUDIO_SECONDS = 180.0
MAX_LRC_BYTES = 64 * 1024
# Bytes needed by `sniff_audio_format`.
SNIFF_BYTES = 12

AudioFormat = Literal["mp3", "wav", "flac"]
CONTENT_TYPES: dict[AudioFormat, str] = {"mp3": "audio/mpeg", "wav": "audio/wav", "flac": "audio/flac"}


class ProjectStatus(StrEnum):
    ANALYZING = "analyzing"
    READY = "ready"
    FAILED = "failed"


@dataclass(frozen=True)
class Project:
    id: str
    audio_hash: str  # "sha256:<hex>"
    audio_key: str
    audio_format: AudioFormat
    duration_sec: float
    lrc_text: str | None
    job_id: str | None
    created_at: datetime
    owner_id: str | None = None  # None: uploaded without a session, readable by its unguessable id
    edits_json: str | None = None  # the owner's note edits (`music-world.edits.v1`), validated before it is stored


def can_access(project: Project, caller_id: str | None) -> bool:
    """Owned projects are visible to their owner only (06-template-store requirement 2.2)."""
    return project.owner_id is None or project.owner_id == caller_id


def sniff_audio_format(header: bytes) -> AudioFormat:
    """Detects the container by magic bytes (never by extension or client MIME type)."""
    if header[:4] == b"RIFF" and header[8:12] == b"WAVE":
        return "wav"
    if header[:4] == b"fLaC":
        return "flac"
    if header[:3] == b"ID3":
        return "mp3"
    # MPEG audio frame sync: 11 set bits, layer III (bits 01), any version but the reserved one.
    if len(header) >= 2 and header[0] == 0xFF and (header[1] & 0xE6) == 0xE2 and (header[1] & 0x18) != 0x08:
        return "mp3"
    raise AudioFormatUnsupportedError("only MP3, WAV and FLAC files are accepted")


def check_audio_size(size: int) -> None:
    if size > MAX_AUDIO_BYTES:
        raise AudioTooLargeError(f"audio file is larger than {MAX_AUDIO_BYTES // (1024 * 1024)} MB")


def check_audio_duration(duration_sec: float) -> None:
    if duration_sec > MAX_AUDIO_SECONDS:
        raise AudioTooLongError(f"audio is longer than {MAX_AUDIO_SECONDS:.0f} seconds")


def decode_lrc(raw: bytes) -> str:
    """The `.lrc` is stored as text and parsed by the analysis context; here only size and encoding are checked."""
    if len(raw) > MAX_LRC_BYTES:
        raise LyricsFileInvalidError(f"lyrics file is larger than {MAX_LRC_BYTES // 1024} KB")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise LyricsFileInvalidError("lyrics file must be UTF-8 text") from error
    if "\x00" in text:
        raise LyricsFileInvalidError("lyrics file must be UTF-8 text")
    return text
