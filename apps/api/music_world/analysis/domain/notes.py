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


# Shortest believable note per stem: sung and bass notes are rarely shorter than a sixteenth at a moderate tempo,
# while the accompaniment ("other") keeps fast figures.
MIN_DURATION_BY_STEM: dict[str, float] = {"vocals": 0.08, "bass": 0.08, "other": 0.06}
# Stems that carry one voice at a time: overlapping notes of these stems are transcription noise.
MONOPHONIC_STEMS = frozenset({"vocals", "bass"})
# Overtones of a note: octave, octave + fifth, two octaves (semitones above the fundamental).
HARMONIC_INTERVALS = (12, 19, 24)
HARMONIC_VELOCITY_RATIO = 1.25
HARMONIC_OVERLAP = 0.6


def _overlap(a: RawNote, b: RawNote) -> float:
    return max(0.0, min(a.time + a.duration, b.time + b.duration) - max(a.time, b.time))


def remove_harmonic_ghosts(notes: Iterable[RawNote]) -> list[RawNote]:
    """Drops a note that is an overtone of a clearly louder note of the same stem: it sounds an octave (or an octave and
    a fifth, or two octaves) above, mostly at the same time, and is at least 1.25 times quieter. The transcriber hears
    the overtones of a strong note as notes of their own: the commonest source of notes that are not in the song."""
    ordered = sorted(notes, key=sort_key)
    dropped: set[int] = set()
    for i, high in enumerate(ordered):
        for j in range(i - 1, -1, -1):
            low = ordered[j]
            if high.time - low.time > 8.0:  # a note is never held longer than this: nothing earlier can overlap
                break
            if low.stem != high.stem or high.midi - low.midi not in HARMONIC_INTERVALS:
                continue
            if (
                _overlap(low, high) >= HARMONIC_OVERLAP * high.duration
                and low.velocity >= HARMONIC_VELOCITY_RATIO * high.velocity
            ):
                dropped.add(i)
                break
    return [n for i, n in enumerate(ordered) if i not in dropped]


def enforce_monophony(notes: Iterable[RawNote]) -> list[RawNote]:
    """One voice at a time: of two notes that sound mostly together the quieter is dropped, otherwise the earlier one
    is cut where the next begins. Applies to one stem; output sorted by `sort_key`."""
    out: list[RawNote] = []
    for note in sorted(notes, key=sort_key):
        if out and note.time < out[-1].time + out[-1].duration:
            prev = out[-1]
            shorter = min(prev.duration, note.duration)
            if _overlap(prev, note) >= 0.5 * shorter:
                if note.velocity > prev.velocity:
                    out[-1] = note
                continue
            cut = note.time - prev.time
            if cut >= MIN_NOTE_DURATION_SEC:
                out[-1] = replace(prev, duration=cut)
            else:
                out.pop()
        out.append(note)
    return out


def clean_notes(notes: Iterable[RawNote], min_velocity: float, duration_sec: float) -> list[RawNote]:
    """One stem's transcription → the notes kept: join fragments, drop short / quiet notes (per-stem minimum length),
    drop overtones and, for single-voice stems, overlaps; then fit inside the song."""
    joined = join_fragments(notes)
    stem = joined[0].stem if joined else ""
    kept = filter_notes(joined, min_velocity, MIN_DURATION_BY_STEM.get(stem, MIN_NOTE_DURATION_SEC))
    kept = remove_harmonic_ghosts(kept)
    if stem in MONOPHONIC_STEMS:
        kept = enforce_monophony(kept)
    return fit_to_song(kept, duration_sec)


@dataclass(frozen=True)
class Chroma:
    """Pitch-class energy of the mix over time: `frames[t][pc]`, C = 0, one frame every `hop_sec`."""

    hop_sec: float
    frames: Sequence[Sequence[float]]


# A note whose pitch class carries less than this share of the strongest pitch class of the mix during the note is not
# in the recording; only quiet notes are dropped so a real note the chroma happens to miss is kept.
CHROMA_MIN_SUPPORT = 0.2
CHROMA_KEEP_VELOCITY = 0.6


def verify_with_chroma(
    notes: Iterable[RawNote],
    chroma: Chroma,
    min_support: float = CHROMA_MIN_SUPPORT,
    keep_velocity: float = CHROMA_KEEP_VELOCITY,
) -> list[RawNote]:
    """Checks the transcription against the recording itself: the mean chroma of the mix during a note must contain
    the note's pitch class. Quiet notes the mix does not support are dropped (they are the notes you do not hear in the
    song); loud notes are always kept."""
    kept: list[RawNote] = []
    n_frames = len(chroma.frames)
    for note in notes:
        if note.velocity >= keep_velocity or n_frames == 0 or chroma.hop_sec <= 0:
            kept.append(note)
            continue
        first = min(n_frames - 1, max(0, int(note.time / chroma.hop_sec)))
        last = min(n_frames, max(first + 1, int((note.time + note.duration) / chroma.hop_sec)))
        window = chroma.frames[first:last]
        means = [sum(frame[pc] for frame in window) / len(window) for pc in range(12)]
        peak = max(means)
        if peak <= 0 or means[note.midi % 12] / peak >= min_support:
            kept.append(note)
    return kept
