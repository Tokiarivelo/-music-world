"""Proxies for "do the notes match the song", computed without a reference transcription.

A wrong note is usually out of the song's key and sounds an octave or a fifth over a louder note. These numbers cannot
prove a transcription is right, but they move the right way when spurious notes are removed, so they are used to compare
two filter settings on the same song (scripts/seed_songs.py --report).
"""

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

from music_world.analysis.domain.harmony import NOTE_NAMES

_MAJOR = (0, 2, 4, 5, 7, 9, 11)
_MINOR = (0, 2, 3, 5, 7, 8, 10)


@dataclass(frozen=True)
class NoteQuality:
    notes: int
    notes_per_second: float
    in_key_ratio: float  # share of the total note duration whose pitch class is in the key's scale
    per_stem: dict[str, int]


def scale_of(key: str) -> frozenset[int]:
    """Pitch classes of a key named like `A minor`; empty when the key is unknown."""
    name, _, mode = key.partition(" ")
    if name not in NOTE_NAMES or mode not in ("major", "minor"):
        return frozenset()
    tonic = NOTE_NAMES.index(name)
    return frozenset((tonic + step) % 12 for step in (_MAJOR if mode == "major" else _MINOR))


def note_quality(notes: Sequence[tuple[int, float, str]], key: str, duration_sec: float) -> NoteQuality:
    """`notes` are `(midi, duration, stem)`."""
    scale = scale_of(key)
    total = sum(d for _, d, _ in notes)
    inside = sum(d for m, d, _ in notes if m % 12 in scale) if scale else 0.0
    return NoteQuality(
        notes=len(notes),
        notes_per_second=round(len(notes) / duration_sec, 2) if duration_sec > 0 else 0.0,
        in_key_ratio=round(inside / total, 3) if total > 0 and scale else 0.0,
        per_stem=dict(Counter(s for _, _, s in notes)),
    )
