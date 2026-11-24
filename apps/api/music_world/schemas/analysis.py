"""Analysis contract (`music-world.analysis.v1`): what the analysis worker produces from one audio file.

Notes come from signal processing (Basic Pitch on Demucs stems), never from an LLM (tech.md rule 1).
The model validator enforces the result invariants of 02-music-analysis requirement 7.2: notes sorted by
(time, midi), every chord's note ids exist, every time inside `[0, durationSec]`, sections contiguous and
covering the song. The generated zod schema does not re-check them (zod ignores pydantic validators).
"""

from typing import Annotated, Literal

from pydantic import ConfigDict, Field, StringConstraints, model_validator

from music_world.schemas.base import ContractModel

SCHEMA_ID = "music-world.analysis.v1"

MAX_DURATION_SEC = 300.0  # the analysed part of a song; a longer song is cut (the player adds generic notes)
# Float slack when comparing times to the song bounds (seconds).
TIME_EPSILON = 1e-6
# Requirement 5.1: chord notes start within 60 ms of each other.
CHORD_ONSET_WINDOW_SEC = 0.06

Stem = Literal["vocals", "drums", "bass", "other"]
LyricsSource = Literal["muse-voice", "lrc", "none"]
NoteId = Annotated[str, StringConstraints(pattern=r"^n_\d{4,}$")]
ChordId = Annotated[str, StringConstraints(pattern=r"^c_\d+$")]
ChordLabel = Annotated[
    str, StringConstraints(pattern=r"^([A-G][#b]?(m|7|maj7|m7|dim|dim7|m7b5|aug|sus2|sus4|6|m6)?|N\.C\.)$")
]
KeyName = Annotated[str, StringConstraints(pattern=r"^([A-G][#b]? (major|minor)|unknown)$")]
SectionLabel = Annotated[str, StringConstraints(pattern=r"^(intro|verse|chorus|bridge|outro|section_\d+)$")]
Seconds = Annotated[float, Field(ge=0, le=MAX_DURATION_SEC + 1)]


class Note(ContractModel):
    """One detected note (`NoteEvent`)."""

    id: NoteId
    time: Seconds = Field(description="Onset, seconds from song start.")
    duration: float = Field(gt=0, le=MAX_DURATION_SEC, description="Seconds; always > 0.")
    midi: int = Field(ge=0, le=127)
    velocity: float = Field(ge=0, le=1)
    stem: Stem
    chord_id: ChordId | None = Field(default=None, description="Chord this note belongs to, if any.")

    @property
    def end(self) -> float:
        return self.time + self.duration


class Chord(ContractModel):
    id: ChordId
    time: Seconds
    duration: float = Field(gt=0, le=MAX_DURATION_SEC)
    label: ChordLabel = Field(description="`C`, `Am`, `G7`, … or `N.C.` when unknown.")
    note_ids: list[NoteId] = Field(min_length=3, description="Notes of the chord (≥ 3 distinct pitch classes).")


class EnergyPoint(ContractModel):
    time: Seconds
    value: float = Field(ge=0, le=1, description="RMS energy normalised to 0–1, sampled at 10 Hz.")


class Section(ContractModel):
    start: Seconds
    end: Seconds
    label: SectionLabel


class LyricSegment(ContractModel):
    start: Seconds
    end: Seconds
    text: str = Field(min_length=1, max_length=500)


class AnalysisResult(ContractModel):
    """Timed notes, chords, tempo and beats, key, energy curve, sections and lyrics of one song."""

    model_config = ConfigDict(title="AnalysisResult")

    schema_: Literal["music-world.analysis.v1"] = Field(alias="schema")
    audio_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$", description="SHA-256 of the uploaded file.")
    duration_sec: float = Field(gt=0, le=MAX_DURATION_SEC)
    tempo_bpm: float = Field(ge=0, le=400, description="0 when no beat was found.")
    beats: list[Seconds] = Field(description="Beat times, ascending.")
    kicks: list[Seconds] = Field(default=[], description="Kick onsets on the drums stem, ascending.")
    key: KeyName
    notes: list[Note] = Field(max_length=20000, description="Sorted by time, then midi.")
    chords: list[Chord] = Field(max_length=5000)
    energy: list[EnergyPoint] = Field(description="Ascending time, 10 Hz.")
    sections: list[Section] = Field(min_length=1, description="Contiguous, covering [0, durationSec].")
    lyrics: list[LyricSegment] = Field(default=[])
    lyrics_source: LyricsSource = "none"

    @model_validator(mode="after")
    def _invariants(self) -> "AnalysisResult":
        errors = analysis_invariant_errors(self)
        if errors:
            raise ValueError("; ".join(errors[:5]))
        return self


def _ascending(values: list[float]) -> bool:
    return all(a <= b for a, b in zip(values, values[1:], strict=False))


def analysis_invariant_errors(result: AnalysisResult) -> list[str]:
    """Requirement 7.2 invariants; returns human-readable violations (empty when valid)."""
    errors: list[str] = []
    limit = result.duration_sec + TIME_EPSILON

    def inside(label: str, *times: float) -> None:
        if any(t > limit for t in times):
            errors.append(f"{label} ends after durationSec")

    keys = [(n.time, n.midi) for n in result.notes]
    if keys != sorted(keys):
        errors.append("notes must be sorted by time, then midi")
    notes = {n.id: n for n in result.notes}
    if len(notes) != len(result.notes):
        errors.append("note ids must be unique")
    for n in result.notes:
        inside(f"note {n.id}", n.end)

    chord_ids = {c.id for c in result.chords}
    if len(chord_ids) != len(result.chords):
        errors.append("chord ids must be unique")
    for c in result.chords:
        inside(f"chord {c.id}", c.time + c.duration)
        members = [notes.get(i) for i in c.note_ids]
        present = [m for m in members if m is not None]
        if len(present) != len(members):
            errors.append(f"chord {c.id} references an unknown note")
            continue
        if len(set(c.note_ids)) != len(c.note_ids):
            errors.append(f"chord {c.id} repeats a note")
        if any(m.chord_id != c.id for m in present):
            errors.append(f"chord {c.id} notes must point back to it")
        starts = [m.time for m in present]
        if max(starts) - min(starts) > CHORD_ONSET_WINDOW_SEC + TIME_EPSILON:
            errors.append(f"chord {c.id} notes must start within {CHORD_ONSET_WINDOW_SEC * 1000:.0f} ms")
        if max(starts) >= min(m.end for m in present):
            errors.append(f"chord {c.id} notes must overlap in time")
    for n in result.notes:
        if n.chord_id is not None and n.chord_id not in chord_ids:
            errors.append(f"note {n.id} references an unknown chord")

    for label, times in (("beats", result.beats), ("kicks", result.kicks)):
        if not _ascending(times):
            errors.append(f"{label} must be ascending")
        inside(label, *times)
    energy_times = [e.time for e in result.energy]
    if not _ascending(energy_times):
        errors.append("energy must be ascending in time")
    inside("energy", *energy_times)

    sections = result.sections
    if sections and abs(sections[0].start) > TIME_EPSILON:
        errors.append("sections must start at 0")
    if sections and abs(sections[-1].end - result.duration_sec) > TIME_EPSILON:
        errors.append("sections must end at durationSec")
    for s in sections:
        if s.start >= s.end:
            errors.append("each section must have start < end")
    for prev, cur in zip(sections, sections[1:], strict=False):
        if abs(cur.start - prev.end) > TIME_EPSILON:
            errors.append("sections must be contiguous")

    for seg in result.lyrics:
        if seg.start > seg.end:
            errors.append("each lyric segment must have start <= end")
        inside("lyrics", seg.end)
    if not _ascending([seg.start for seg in result.lyrics]):
        errors.append("lyrics must be ascending by start")
    if result.lyrics_source == "none" and result.lyrics:
        errors.append("lyricsSource none requires empty lyrics")
    return errors
