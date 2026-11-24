"""Ports of the analysis context (implemented in infrastructure/).

Stages exchange files (WAV/FLAC paths on the worker's disk) and plain domain dataclasses, so the application layer
never touches numpy, torch or librosa.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from music_world.analysis.domain.audio import DecodedAudio
from music_world.analysis.domain.lyrics import LyricLine
from music_world.analysis.domain.notes import Chroma, RawNote
from music_world.schemas.analysis import AnalysisResult


class AudioDecoder(Protocol):
    """Decodes an upload to a 44.1 kHz stereo WAV (first `MAX_DURATION_SEC` s); raises `AudioDecodeError`."""

    async def decode(self, source: Path, target: Path) -> DecodedAudio: ...


class Separator(Protocol):
    """Splits the mix into the `STEMS` files inside `out_dir`; raises `SeparationError`."""

    async def separate(self, mix: DecodedAudio, out_dir: Path) -> dict[str, Path]: ...


class NoteTranscriber(Protocol):
    """Notes of one stem file; raises `TranscriptionError`."""

    async def transcribe(self, stem_path: Path, stem: str) -> list[RawNote]: ...


@dataclass(frozen=True)
class Rhythm:
    tempo_bpm: float
    beats: tuple[float, ...]
    kicks: tuple[float, ...]
    rms: tuple[float, ...]  # mix RMS sampled at `ENERGY_RATE_HZ`, not normalised


class RhythmAnalyzer(Protocol):
    async def analyze(self, mix: Path, drums: Path | None) -> Rhythm: ...


@dataclass(frozen=True)
class Structure:
    chroma_profile: tuple[float, ...]  # 12 values, C first
    boundaries: tuple[float, ...]  # inner cut times, seconds
    clusters: tuple[int, ...]  # repetition cluster per segment (len(boundaries) + 1)


class StructureAnalyzer(Protocol):
    async def analyze(self, mix: Path) -> Structure: ...


class ChromaAnalyzer(Protocol):
    """Pitch-class energy of the mix over time, used to check the transcribed notes against the recording."""

    async def analyze(self, mix: Path) -> Chroma: ...


class LyricsTranscriber(Protocol):
    """Timed lyrics from the vocal stem; returns [] when nothing usable was heard. Never logs the text."""

    async def transcribe(self, vocals: Path, duration_sec: float) -> list[LyricLine]: ...


@dataclass(frozen=True)
class FoundLyrics:
    lines: tuple[LyricLine, ...]
    instrumental: bool = False  # the catalog says the track has no vocals: nothing to transcribe either


class LyricsLookup(Protocol):
    """Synced lyrics of a known track from an online catalog; None when not found or the service is unreachable.
    Sends only the artist, the title and the duration; never logs the text."""

    async def find(self, artist: str, title: str, duration_sec: float) -> FoundLyrics | None: ...


class TagReader(Protocol):
    """(artist, title) written in the audio file's tags; None when absent."""

    async def read(self, audio: Path) -> tuple[str, str] | None: ...


class ProgressReporter(Protocol):
    async def __call__(self, progress: float, stage: str | None = None) -> None: ...


class ObjectStore(Protocol):
    async def put_file(self, key: str, path: Path, content_type: str) -> None: ...
    async def put_bytes(self, key: str, data: bytes, content_type: str) -> None: ...
    async def get_bytes(self, key: str) -> bytes | None: ...
    async def get_file(self, key: str, dest: Path) -> bool: ...
    async def exists(self, key: str) -> bool: ...


@dataclass(frozen=True)
class ProjectAudio:
    audio_hash: str
    audio_key: str
    lrc_text: str | None


class ProjectAudioSource(Protocol):
    """Implemented over the projects context; raises its `PROJECT_NOT_FOUND` error for unknown ids."""

    async def get(self, project_id: str) -> ProjectAudio: ...


class AnalysisRepository(Protocol):
    """Finished analyses, keyed by audio hash (the cache of requirement 1.4)."""

    async def exists(self, audio_hash: str) -> bool: ...
    async def get(self, audio_hash: str) -> AnalysisResult | None: ...
    async def save(self, result: AnalysisResult) -> None: ...
