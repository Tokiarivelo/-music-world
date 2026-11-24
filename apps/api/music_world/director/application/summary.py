"""Compact text summary of an analysis for the director prompt (requirement 2.1). Never the raw note list."""

import hashlib
import statistics
from dataclasses import dataclass

from music_world.schemas.analysis import AnalysisResult

ENERGY_POINTS = 32
MAX_CHORDS_PER_SECTION = 8
MAX_LYRICS_CHARS = 1500


@dataclass(frozen=True)
class SectionSummary:
    label: str
    start: float
    end: float
    note_density: float  # notes per second
    mean_energy: float
    chords: tuple[str, ...]


@dataclass(frozen=True)
class AnalysisSummary:
    audio_hash: str
    key: str
    tempo_bpm: float
    duration_sec: float
    note_count: int
    note_density: float
    pitch_min: int
    pitch_median: int
    pitch_max: int
    stems: tuple[str, ...]
    sections: tuple[SectionSummary, ...]
    energy_curve: tuple[float, ...]
    lyrics: str  # user content: sent to the provider, never logged
    lyric_lines: int

    @property
    def is_minor(self) -> bool:
        return self.key.endswith("minor")

    @property
    def mean_energy(self) -> float:
        return round(statistics.fmean(self.energy_curve), 3) if self.energy_curve else 0.0

    def text(self) -> str:
        lines = [
            f"Key: {self.key}",
            f"Tempo: {self.tempo_bpm:.0f} BPM",
            f"Duration: {self.duration_sec:.1f} s",
            f"Notes: {self.note_count} ({self.note_density:.2f} per second), stems: {', '.join(self.stems) or 'none'}",
            f"Pitch range (MIDI): min {self.pitch_min}, median {self.pitch_median}, max {self.pitch_max}",
            f"Energy curve ({len(self.energy_curve)} points, 0-1): " + " ".join(f"{v:.2f}" for v in self.energy_curve),
            "Sections:",
        ]
        for s in self.sections:
            chords = " ".join(s.chords) or "none"
            lines.append(
                f"- {s.label} {s.start:.1f}-{s.end:.1f} s: {s.note_density:.2f} notes/s, "
                f"energy {s.mean_energy:.2f}, chords {chords}"
            )
        lines.append(f"Lyrics ({self.lyric_lines} lines):" if self.lyrics else "Lyrics: none")
        if self.lyrics:
            lines.append(self.lyrics)
        return "\n".join(lines)

    def digest(self) -> str:
        return hashlib.sha256(self.text().encode()).hexdigest()


def _bucket_means(times: list[float], values: list[float], duration: float, n: int) -> tuple[float, ...]:
    if not values:
        return ()
    sums, counts = [0.0] * n, [0] * n
    for t, v in zip(times, values, strict=True):
        i = min(int(t / duration * n), n - 1) if duration > 0 else 0
        sums[i] += v
        counts[i] += 1
    out: list[float] = []
    last = values[0]
    for s, c in zip(sums, counts, strict=True):
        last = s / c if c else last
        out.append(round(last, 2))
    return tuple(out)


def _dedupe(labels: list[str]) -> tuple[str, ...]:
    out: list[str] = []
    for label in labels:
        if not out or out[-1] != label:
            out.append(label)
    return tuple(out[:MAX_CHORDS_PER_SECTION])


def summarize(analysis: AnalysisResult) -> AnalysisSummary:
    """Deterministic summary: same analysis → same text (and cache key)."""
    duration = analysis.duration_sec
    pitches = sorted(n.midi for n in analysis.notes)
    sections = []
    for s in analysis.sections:
        span = max(s.end - s.start, 1e-6)
        inside = [n for n in analysis.notes if s.start <= n.time < s.end]
        energy = [e.value for e in analysis.energy if s.start <= e.time < s.end]
        chords = [c.label for c in analysis.chords if s.start <= c.time < s.end and c.label != "N.C."]
        sections.append(
            SectionSummary(
                label=s.label,
                start=round(s.start, 2),
                end=round(s.end, 2),
                note_density=round(len(inside) / span, 2),
                mean_energy=round(statistics.fmean(energy), 2) if energy else 0.0,
                chords=_dedupe(chords),
            )
        )
    lyrics = "\n".join(seg.text for seg in analysis.lyrics)[:MAX_LYRICS_CHARS]
    return AnalysisSummary(
        audio_hash=analysis.audio_hash,
        key=analysis.key,
        tempo_bpm=round(analysis.tempo_bpm, 1),
        duration_sec=round(duration, 2),
        note_count=len(analysis.notes),
        note_density=round(len(analysis.notes) / duration, 2),
        pitch_min=pitches[0] if pitches else 60,
        pitch_median=pitches[len(pitches) // 2] if pitches else 60,
        pitch_max=pitches[-1] if pitches else 60,
        stems=tuple(sorted({n.stem for n in analysis.notes})),
        sections=tuple(sections),
        energy_curve=_bucket_means(
            [e.time for e in analysis.energy], [e.value for e in analysis.energy], duration, ENERGY_POINTS
        ),
        lyrics=lyrics,
        lyric_lines=len(analysis.lyrics),
    )
