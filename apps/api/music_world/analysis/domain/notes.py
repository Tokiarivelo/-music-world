"""Notes as detected by the transcriber, and the pure filters applied before they enter `AnalysisResult`."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, replace

# Requirement 3.3: notes shorter than 50 ms are dropped.
MIN_NOTE_DURATION_SEC = 0.05
# Schema cap (`AnalysisResult.notes` max length).
MAX_NOTES = 20000


@dataclass(frozen=True)
class RawNote:
    time: float
    duration: float
    midi: int
    velocity: float
    stem: str


def sort_key(note: RawNote) -> tuple[float, int, str]:
    """Requirement 3.4: by time, then midi (stem only breaks exact ties, for determinism)."""
    return (note.time, note.midi, note.stem)


def filter_notes(
    notes: Iterable[RawNote], min_velocity: float, min_duration: float = MIN_NOTE_DURATION_SEC
) -> list[RawNote]:
    """Keeps notes at least `min_duration` long with velocity ≥ `min_velocity`; preserves input order."""
    return [n for n in notes if n.duration >= min_duration and n.velocity >= min_velocity]


def fit_to_song(
    notes: Iterable[RawNote], duration_sec: float, min_duration: float = MIN_NOTE_DURATION_SEC
) -> list[RawNote]:
    """Clamps notes inside `[0, duration_sec]` and midi/velocity to their ranges; drops notes that get too short."""
    fitted: list[RawNote] = []
    for n in notes:
        start = min(max(n.time, 0.0), duration_sec)
        end = min(max(n.time + n.duration, 0.0), duration_sec)
        if end - start < min_duration:
            continue
        fitted.append(
            replace(
                n,
                time=start,
                duration=end - start,
                midi=min(max(n.midi, 0), 127),
                velocity=min(max(n.velocity, 0.0), 1.0),
            )
        )
    return fitted


def merge_stems(per_stem: Sequence[Sequence[RawNote]], max_notes: int = MAX_NOTES) -> list[RawNote]:
    """Merges the stems' notes, removes exact duplicates, sorts them (requirement 3.4) and caps the count, keeping
    the loudest notes when the cap is hit."""
    unique: dict[tuple[float, int, str], RawNote] = {}
    for notes in per_stem:
        for n in notes:
            key = (n.time, n.midi, n.stem)
            kept = unique.get(key)
            # Exact duplicates keep the loudest (then longest) note, whatever the input order.
            if kept is None or (n.velocity, n.duration) > (kept.velocity, kept.duration):
                unique[key] = n
    merged = sorted(unique.values(), key=sort_key)
    if len(merged) > max_notes:
        loudest = sorted(merged, key=lambda n: (-n.velocity, sort_key(n)))[:max_notes]
        merged = sorted(loudest, key=sort_key)
    return merged


# Fragments of one held note (same stem and pitch) separated by less than this are joined.
FRAGMENT_GAP_SEC = 0.03


def join_fragments(notes: Iterable[RawNote], max_gap: float = FRAGMENT_GAP_SEC) -> list[RawNote]:
    """Joins notes of the same stem and pitch that overlap or follow each other within `max_gap` (the transcriber
    sometimes splits one held note). The joined note keeps the first onset and the loudest velocity.
    Returns the notes sorted by `sort_key`."""
    by_voice: dict[tuple[str, int], list[RawNote]] = {}
    for n in sorted(notes, key=sort_key):
        voice = by_voice.setdefault((n.stem, n.midi), [])
        if voice and n.time - (voice[-1].time + voice[-1].duration) < max_gap:
            last = voice[-1]
            end = max(last.time + last.duration, n.time + n.duration)
            voice[-1] = replace(last, duration=end - last.time, velocity=max(last.velocity, n.velocity))
        else:
            voice.append(n)
    return sorted((n for voice in by_voice.values() for n in voice), key=sort_key)


def clean_notes(notes: Iterable[RawNote], min_velocity: float, duration_sec: float) -> list[RawNote]:
    """One stem's transcription → the notes kept: join fragments, drop short/quiet notes, fit inside the song."""
    return fit_to_song(filter_notes(join_fragments(notes), min_velocity), duration_sec)
