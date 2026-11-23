"""Chords from notes and key from a chroma profile (pure functions, requirement 4.2, 5.1, 5.2)."""

import math
from collections.abc import Sequence
from dataclasses import dataclass

from music_world.analysis.domain.notes import RawNote

# Requirement 5.1: notes that start within 60 ms of each other and overlap in time form a chord.
CHORD_ONSET_WINDOW_SEC = 0.06
MIN_CHORD_PITCH_CLASSES = 3
NO_CHORD = "N.C."

NOTE_NAMES = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")

# Quality suffix → intervals above the root. Listed richest first so a full seventh beats its triad.
CHORD_QUALITIES: tuple[tuple[str, frozenset[int]], ...] = (
    ("maj7", frozenset({0, 4, 7, 11})),
    ("7", frozenset({0, 4, 7, 10})),
    ("m7", frozenset({0, 3, 7, 10})),
    ("m7b5", frozenset({0, 3, 6, 10})),
    ("dim7", frozenset({0, 3, 6, 9})),
    ("6", frozenset({0, 4, 7, 9})),
    ("m6", frozenset({0, 3, 7, 9})),
    ("", frozenset({0, 4, 7})),
    ("m", frozenset({0, 3, 7})),
    ("dim", frozenset({0, 3, 6})),
    ("aug", frozenset({0, 4, 8})),
    ("sus4", frozenset({0, 5, 7})),
    ("sus2", frozenset({0, 2, 7})),
)

# Krumhansl–Kessler key profiles (major, minor), tonic first.
MAJOR_PROFILE = (6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
MINOR_PROFILE = (6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)


@dataclass(frozen=True)
class ChordGroup:
    """Indices into the note list the grouping was computed on."""

    note_indices: tuple[int, ...]
    label: str


def _end(note: RawNote) -> float:
    return note.time + note.duration


def group_chords(notes: Sequence[RawNote], window: float = CHORD_ONSET_WINDOW_SEC) -> list[ChordGroup]:
    """Greedy grouping over notes sorted by onset: each still-free note opens a group with the free notes that start
    within `window` after it and overlap every member; groups with ≥ 3 distinct pitch classes become chords.

    Every note belongs to at most one chord; chord notes start within `window` and share a common instant.
    """
    order = sorted(range(len(notes)), key=lambda i: (notes[i].time, notes[i].midi, notes[i].stem))
    used: set[int] = set()
    chords: list[ChordGroup] = []
    for pos, anchor in enumerate(order):
        if anchor in used:
            continue
        a = notes[anchor]
        members = [anchor]
        latest_start, earliest_end = a.time, _end(a)
        for other in order[pos + 1 :]:
            n = notes[other]
            if n.time - a.time > window:
                break
            if other in used:
                continue
            start, end = max(latest_start, n.time), min(earliest_end, _end(n))
            if start < end:  # still a common instant shared by every member
                members.append(other)
                latest_start, earliest_end = start, end
        pitch_classes = {notes[i].midi % 12 for i in members}
        if len(pitch_classes) >= MIN_CHORD_PITCH_CLASSES:
            used.update(members)
            bass = min(notes[i].midi for i in members) % 12
            chords.append(ChordGroup(tuple(sorted(members)), label_chord(pitch_classes, bass)))
    return chords


def label_chord(pitch_classes: set[int] | frozenset[int], bass: int | None = None) -> str:
    """Names a pitch-class set (`C`, `Am`, `G7`, …) or `N.C.`.

    A candidate (root, quality) must contain all its intervals in the set. The best candidate covers most of the
    set; ties prefer the bass note as root, then the order of `CHORD_QUALITIES`, then the lowest root.
    """
    best: tuple[tuple[int, int, int, int], str] | None = None
    for root in range(12):
        relative = frozenset((pc - root) % 12 for pc in pitch_classes)
        for rank, (suffix, intervals) in enumerate(CHORD_QUALITIES):
            if not intervals <= relative:
                continue
            score = (len(intervals), 1 if root == bass else 0, -rank, -root)
            if best is None or score > best[0]:
                best = (score, f"{NOTE_NAMES[root]}{suffix}")
    return best[1] if best else NO_CHORD


def _correlation(a: Sequence[float], b: Sequence[float]) -> float:
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    da, db = [x - ma for x in a], [y - mb for y in b]
    den = math.sqrt(sum(x * x for x in da) * sum(y * y for y in db))
    return sum(x * y for x, y in zip(da, db, strict=True)) / den if den > 0 else 0.0


def estimate_key(chroma: Sequence[float]) -> str:
    """Krumhansl–Schmuckler: the key whose rotated profile best correlates with the chroma profile.

    `chroma[i]` is the energy of pitch class i (C = 0). A flat or silent profile is `unknown`.
    """
    if len(chroma) != 12 or max(chroma) - min(chroma) <= 1e-9:
        return "unknown"
    best_score, best_key = -2.0, "unknown"
    for tonic in range(12):
        rotated = [chroma[(tonic + i) % 12] for i in range(12)]
        for mode, profile in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
            score = _correlation(rotated, profile)
            if score > best_score + 1e-12:
                best_score, best_key = score, f"{NOTE_NAMES[tonic]} {mode}"
    return best_key
