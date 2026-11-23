"""Timed lyrics (requirement 6). Lyrics are user content: never log their text."""

from dataclasses import dataclass


@dataclass(frozen=True)
class LyricLine:
    start: float
    end: float
    text: str
