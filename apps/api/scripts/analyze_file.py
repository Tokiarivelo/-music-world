"""Run the real analysis pipeline on a local audio file and write its `music-world.analysis.v1` JSON.

Usage: uv run python scripts/analyze_file.py <audio> <out.json> [--min-velocity 0.25]

No database, queue or S3: a temporary local object store and an in-memory cache. Prints wall and CPU time per
stage (02-music-analysis task 4 / 10 measurements, pre-analysed demo fixture).
"""

import argparse
import asyncio
import hashlib
import json
import shutil
import tempfile
import time
from pathlib import Path

from music_world.analysis.application.use_cases.analyze_audio import AnalyzeAudio, AnalyzeAudioInput
from music_world.analysis.infrastructure.basic_pitch_transcriber import BasicPitchTranscriber
from music_world.analysis.infrastructure.demucs_separator import DemucsSeparator
from music_world.analysis.infrastructure.ffmpeg_decoder import FfmpegDecoder
from music_world.analysis.infrastructure.librosa_rhythm import LibrosaRhythmAnalyzer
from music_world.analysis.infrastructure.librosa_structure import LibrosaStructureAnalyzer
from music_world.analysis.infrastructure.null_lyrics import NoLyricsTranscriber
from music_world.schemas.analysis import AnalysisResult
from music_world.shared.object_store import LocalObjectStore


class MemoryRepo:
    def __init__(self) -> None:
        self.results: dict[str, AnalysisResult] = {}

    async def exists(self, audio_hash: str) -> bool:
        return audio_hash in self.results

    async def get(self, audio_hash: str) -> AnalysisResult | None:
        return self.results.get(audio_hash)

    async def save(self, result: AnalysisResult) -> None:
        self.results[result.audio_hash] = result


class StageTimer:
    def __init__(self) -> None:
        self.marks: list[tuple[str, float, float]] = []

    async def __call__(self, progress: float, stage: str | None = None) -> None:
        self.marks.append((stage or "?", time.perf_counter(), time.process_time()))

    def report(self) -> list[tuple[str, float, float]]:
        end = (time.perf_counter(), time.process_time())
        rows = []
        for i, (stage, wall, cpu) in enumerate(self.marks):
            next_wall, next_cpu = self.marks[i + 1][1:] if i + 1 < len(self.marks) else end
            rows.append((stage, next_wall - wall, next_cpu - cpu))
        return rows


async def main(audio: Path, out: Path, min_velocity: float) -> None:
    digest = hashlib.sha256(audio.read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory(prefix="mw-store-") as tmp:
        store = LocalObjectStore(Path(tmp))
        key = f"audio/{digest}{audio.suffix}"
        await store.put_file(key, audio, "application/octet-stream")
        use_case = AnalyzeAudio(
            MemoryRepo(), store, FfmpegDecoder(), DemucsSeparator(), BasicPitchTranscriber(),
            LibrosaRhythmAnalyzer(), LibrosaStructureAnalyzer(), NoLyricsTranscriber(), min_velocity=min_velocity,
        )  # fmt: skip
        timer = StageTimer()
        wall, cpu = time.perf_counter(), time.process_time()
        result = await use_case.execute(AnalyzeAudioInput(f"sha256:{digest}", key), timer)
        total_wall, total_cpu = time.perf_counter() - wall, time.process_time() - cpu
    out.write_text(json.dumps(result.model_dump(mode="json", by_alias=True), indent=1) + "\n")
    print(f"[analyze] {audio.name}: {result.duration_sec:.1f} s, {len(result.notes)} notes, "
          f"{len(result.chords)} chords, key {result.key}, {result.tempo_bpm:.0f} BPM, "
          f"sections {[s.label for s in result.sections]}")  # fmt: skip
    for stage, w, c in timer.report():
        print(f"[analyze]   {stage:<10} wall {w:7.1f} s   cpu {c:7.1f} s")
    print(f"[analyze]   {'total':<10} wall {total_wall:7.1f} s   cpu {total_cpu:7.1f} s  → {out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--min-velocity", type=float, default=0.25)
    args = parser.parse_args()
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is required")
    asyncio.run(main(args.audio, args.out, args.min_velocity))
