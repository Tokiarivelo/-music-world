"""`AnalyzeAudio`: the analysis pipeline (design.md § Pipeline) for one audio hash.

decode → separate → transcribe → rhythm → structure → harmony → lyrics → validate + store.

- Idempotent: a hash that already has an `AnalysisResult` returns it without work.
- Resumable: each expensive stage persists its output in object storage (`stems/<hex>/…`, `work/<hex>/…`) before
  the next starts; a rerun after a crash reloads finished stages instead of recomputing them.
- Progress is reported per stage with a fixed weight, monotonic in [0, 1].
"""

import json
import tempfile
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from music_world.analysis.application.ports import (
    AnalysisRepository,
    AudioDecoder,
    LyricsTranscriber,
    NoteTranscriber,
    ObjectStore,
    ProgressReporter,
    Rhythm,
    RhythmAnalyzer,
    Separator,
    Structure,
    StructureAnalyzer,
)
from music_world.analysis.domain.audio import PITCHED_STEMS, STEMS, DecodedAudio
from music_world.analysis.domain.errors import AnalysisInvalidError, AudioMissingError
from music_world.analysis.domain.harmony import ChordGroup, estimate_key, group_chords
from music_world.analysis.domain.lyrics import LyricLine
from music_world.analysis.domain.notes import RawNote, clean_notes, merge_stems
from music_world.analysis.domain.structure import build_segments, label_sections, normalize_energy
from music_world.schemas.analysis import SCHEMA_ID, TIME_EPSILON, AnalysisResult

# (stage, weight). Weights follow the measured CPU share (design.md § As built); they sum to 1.
STAGES: tuple[tuple[str, float], ...] = (
    ("decode", 0.01),
    ("separate", 0.86),
    ("transcribe", 0.09),
    ("rhythm", 0.02),
    ("structure", 0.01),
    ("harmony", 0.005),
    ("lyrics", 0.003),
    ("store", 0.002),
)
STAGE_NAMES = tuple(name for name, _ in STAGES)
STEM_CONTENT_TYPE = "audio/flac"
JSON_CONTENT_TYPE = "application/json"
_ROUND = 4  # decimals kept for times on the wire (0.1 ms)
MAX_CHORDS = 5000  # schema cap


@dataclass(frozen=True)
class AnalyzeAudioInput:
    audio_hash: str  # "sha256:<hex>"
    audio_key: str


def stem_key(audio_hash: str, stem: str) -> str:
    return f"stems/{audio_hash.removeprefix('sha256:')}/{stem}.flac"


def _work_key(audio_hash: str, name: str) -> str:
    return f"work/{audio_hash.removeprefix('sha256:')}/{name}.json"


class _Progress:
    def __init__(self, report: ProgressReporter) -> None:
        self._report = report
        self._starts: dict[str, float] = {}
        total = 0.0
        for name, weight in STAGES:
            self._starts[name] = total
            total += weight

    async def start(self, stage: str) -> None:
        await self._report(round(self._starts[stage], 4), stage)


class AnalyzeAudio:
    def __init__(
        self,
        repo: AnalysisRepository,
        store: ObjectStore,
        decoder: AudioDecoder,
        separator: Separator,
        transcriber: NoteTranscriber,
        rhythm: RhythmAnalyzer,
        structure: StructureAnalyzer,
        lyrics: LyricsTranscriber,
        min_velocity: float,
        work_root: Path | None = None,
    ) -> None:
        self._repo, self._store, self._decoder, self._separator = repo, store, decoder, separator
        self._transcriber, self._rhythm, self._structure, self._lyrics = transcriber, rhythm, structure, lyrics
        self._min_velocity, self._work_root = min_velocity, work_root

    async def execute(self, data: AnalyzeAudioInput, report: ProgressReporter) -> AnalysisResult:
        cached = await self._repo.get(data.audio_hash)
        if cached is not None:
            return cached
        progress = _Progress(report)
        with tempfile.TemporaryDirectory(prefix="mw-analysis-", dir=self._work_root) as tmp:
            work = Path(tmp)
            await progress.start("decode")
            source = work / "source"
            if not await self._store.get_file(data.audio_key, source):
                raise AudioMissingError("the uploaded audio is missing from storage")
            mix = await self._decoder.decode(source, work / "mix.wav")
            duration = round(mix.duration_sec, _ROUND)

            await progress.start("separate")
            stems = await self._stems(data.audio_hash, mix, work / "stems")

            await progress.start("transcribe")
            notes = await self._notes(data.audio_hash, stems, duration)

            await progress.start("rhythm")
            rhythm = await self._cached_rhythm(data.audio_hash, mix.path, stems.get("drums"))

            await progress.start("structure")
            structure = await self._cached_structure(data.audio_hash, mix.path)

            await progress.start("harmony")
            chords = group_chords(notes)
            key = estimate_key(structure.chroma_profile)

            await progress.start("lyrics")
            lyrics = await self._lyrics.transcribe(stems["vocals"], duration)

            await progress.start("store")
            result = assemble_result(data.audio_hash, duration, notes, chords, key, rhythm, structure, lyrics)
        await self._repo.save(result)
        return result

    async def _stems(self, audio_hash: str, mix: DecodedAudio, out_dir: Path) -> dict[str, Path]:
        out_dir.mkdir(parents=True, exist_ok=True)
        paths = {stem: out_dir / f"{stem}.flac" for stem in STEMS}
        restored = [await self._store.get_file(stem_key(audio_hash, s), p) for s, p in paths.items()]
        if all(restored):
            return paths
        separated = await self._separator.separate(mix, out_dir)
        for stem in STEMS:  # requirement 2.2: stems in object storage
            await self._store.put_file(stem_key(audio_hash, stem), separated[stem], STEM_CONTENT_TYPE)
        return separated

    async def _notes(self, audio_hash: str, stems: dict[str, Path], duration: float) -> list[RawNote]:
        key = _work_key(audio_hash, "notes")
        saved = await self._load_json(key)
        if saved is None:
            raw = [await self._transcriber.transcribe(stems[stem], stem) for stem in PITCHED_STEMS]
            await self._save_json(key, [[asdict(n) for n in notes] for notes in raw])
        else:
            raw = [[RawNote(**n) for n in notes] for notes in saved]
        # Filters run on every load, so a new ANALYSIS_MIN_VELOCITY applies without re-transcribing.
        kept = [_rounded(clean_notes(notes, self._min_velocity, duration)) for notes in raw]
        return merge_stems(kept)

    async def _cached_rhythm(self, audio_hash: str, mix: Path, drums: Path | None) -> Rhythm:
        key = _work_key(audio_hash, "rhythm")
        saved = await self._load_json(key)
        if saved is not None:
            return Rhythm(saved["tempo_bpm"], tuple(saved["beats"]), tuple(saved["kicks"]), tuple(saved["rms"]))
        rhythm = await self._rhythm.analyze(mix, drums)
        await self._save_json(key, asdict(rhythm))
        return rhythm

    async def _cached_structure(self, audio_hash: str, mix: Path) -> Structure:
        key = _work_key(audio_hash, "structure")
        saved = await self._load_json(key)
        if saved is not None:
            return Structure(tuple(saved["chroma_profile"]), tuple(saved["boundaries"]), tuple(saved["clusters"]))
        structure = await self._structure.analyze(mix)
        await self._save_json(key, asdict(structure))
        return structure

    async def _load_json(self, key: str) -> Any:
        raw = await self._store.get_bytes(key)
        return json.loads(raw) if raw is not None else None

    async def _save_json(self, key: str, value: Any) -> None:
        await self._store.put_bytes(key, json.dumps(value).encode(), JSON_CONTENT_TYPE)


def _rounded(notes: Sequence[RawNote]) -> list[RawNote]:
    """Rounds start and end to 0.1 ms before sorting and chord grouping, so the wire order and the chord windows are
    computed on the exact values that are stored."""
    out = []
    for n in notes:
        start, end = round(n.time, _ROUND), round(n.time + n.duration, _ROUND)
        if end > start:
            out.append(RawNote(start, end - start, n.midi, round(n.velocity, 3), n.stem))
    return out


def _inside(times: Sequence[float], duration: float) -> list[float]:
    return sorted({round(t, _ROUND) for t in times if 0 <= round(t, _ROUND) <= duration})


def assemble_result(
    audio_hash: str,
    duration_sec: float,
    notes: Sequence[RawNote],
    chords: Sequence[ChordGroup],
    key: str,
    rhythm: Rhythm,
    structure: Structure,
    lyrics: Sequence[LyricLine],
) -> AnalysisResult:
    """Builds and validates the `music-world.analysis.v1` document (ids `n_<i>` / `c_<i>`, requirement 7).

    `notes` must be sorted (`merge_stems`) and `chords` computed on that same list.
    """
    duration = duration_sec
    # Same float tolerance as the schema validator: `end - start` rounding must not drop a note at the song's end.
    keep = [i for i, n in enumerate(notes) if n.duration > 0 and n.time + n.duration <= duration + TIME_EPSILON]
    index_of = {old: new for new, old in enumerate(keep)}
    note_docs: list[dict[str, Any]] = [
        {"id": f"n_{new:04d}", "time": notes[old].time, "duration": notes[old].duration,
         "midi": notes[old].midi, "velocity": notes[old].velocity, "stem": notes[old].stem, "chordId": None}
        for new, old in enumerate(keep)
    ]  # fmt: skip
    chord_docs: list[dict[str, Any]] = []
    for chord in chords:
        members = [index_of[i] for i in chord.note_indices if i in index_of]
        if len(members) != len(chord.note_indices):
            continue
        chord_id = f"c_{len(chord_docs)}"
        for m in members:
            note_docs[m]["chordId"] = chord_id
        start = min(note_docs[m]["time"] for m in members)
        end = max(note_docs[m]["time"] + note_docs[m]["duration"] for m in members)
        chord_docs.append(
            {"id": chord_id, "time": start, "duration": round(min(end, duration) - start, _ROUND),
             "label": chord.label, "noteIds": [note_docs[m]["id"] for m in sorted(members)]}
        )  # fmt: skip
    chord_docs = chord_docs[:MAX_CHORDS]
    for note in note_docs:  # notes of chords cut by the cap leave their chord
        if note["chordId"] is not None and int(note["chordId"][2:]) >= MAX_CHORDS:
            note["chordId"] = None
    sections = label_sections(build_segments(structure.boundaries, structure.clusters, duration), duration)
    section_docs = [{"start": round(s.start, _ROUND), "end": round(s.end, _ROUND), "label": s.label} for s in sections]
    section_docs[0]["start"], section_docs[-1]["end"] = 0.0, duration
    lyric_docs = [
        {"start": round(line.start, _ROUND), "end": round(min(line.end, duration), _ROUND), "text": line.text[:500]}
        for line in sorted(lyrics, key=lambda line: line.start)
        if line.text.strip() and 0 <= line.start <= duration
    ]
    doc = {
        "schema": SCHEMA_ID,
        "audioHash": audio_hash,
        "durationSec": duration,
        "tempoBpm": round(min(max(rhythm.tempo_bpm, 0.0), 400.0), 2),
        "beats": _inside(rhythm.beats, duration),
        "kicks": _inside(rhythm.kicks, duration),
        "key": key,
        "notes": note_docs,
        "chords": chord_docs,
        "energy": [
            {"time": round(e.time, _ROUND), "value": round(e.value, 4)} for e in normalize_energy(rhythm.rms, duration)
        ],
        "sections": section_docs,
        "lyrics": lyric_docs,
        "lyricsSource": "muse-voice" if lyric_docs else "none",
    }
    try:
        return AnalysisResult.model_validate(doc)
    except ValueError as error:  # pydantic ValidationError: a pipeline bug, never user input
        raise AnalysisInvalidError(f"pipeline produced an invalid analysis: {str(error)[:300]}") from error
