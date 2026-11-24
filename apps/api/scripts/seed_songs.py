"""Seed the song catalog: store each audio file, create its project, run the real analysis pipeline, save the analysis
(notes, chords, sections, energy, key, tempo) and the catalog row.

Usage (from apps/api, with DATABASE_URL and the S3_* settings in .env; migrations applied):
    uv run python scripts/seed_songs.py --audio-dir ~/Téléchargements [--only slug] [--force] [--report]

- Idempotent: a song whose analysis is stored is not analysed again. `--force` recomputes the analysis; the stems and
  the raw transcription are cached in the object store, so only the cleaning filters and the chroma check run again
  (seconds).
- `--report` prints note-quality proxies (see analysis/domain/quality.py) and changes nothing.
- A song with `is_public: false` (all rights reserved) is refused on a non-local object store: it never reaches R2.
"""

import argparse
import asyncio
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

from music_world.analysis.application.use_cases.analyze_audio import AnalyzeAudio, AnalyzeAudioInput
from music_world.analysis.domain.quality import note_quality
from music_world.analysis.infrastructure.basic_pitch_transcriber import BasicPitchTranscriber
from music_world.analysis.infrastructure.demucs_separator import DemucsSeparator
from music_world.analysis.infrastructure.ffmpeg_decoder import FfmpegDecoder
from music_world.analysis.infrastructure.librosa_chroma import LibrosaChromaAnalyzer
from music_world.analysis.infrastructure.librosa_rhythm import LibrosaRhythmAnalyzer
from music_world.analysis.infrastructure.librosa_structure import LibrosaStructureAnalyzer
from music_world.analysis.infrastructure.null_lyrics import NoLyricsTranscriber
from music_world.analysis.infrastructure.sqlalchemy_analysis_repository import AnalysisRow, SqlAlchemyAnalysisRepository
from music_world.projects.domain.project import Project
from music_world.projects.infrastructure.sqlalchemy_project_repository import SqlAlchemyProjectRepository
from music_world.projects.infrastructure.sqlalchemy_song_repository import Song, SqlAlchemySongRepository
from music_world.shared.clock import utc_now
from music_world.shared.db import create_engine, create_session_factory
from music_world.shared.ids import uuid7
from music_world.shared.object_store import build_object_store
from music_world.shared.settings import Settings

MANIFEST = Path(__file__).resolve().parents[1] / "seed" / "songs.json"
PIPELINE_VERSION = "notes-v2"  # bump when the note filters change (shown in the catalog)
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "garage"}


def _is_local(settings: Settings) -> bool:
    if not settings.storage_configured:
        return True  # the local directory store
    return (urlparse(settings.s3_endpoint or "").hostname or "") in _LOCAL_HOSTS


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(1 << 20):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def _format(path: Path) -> str:
    suffix = path.suffix.lower().lstrip(".")
    return suffix if re.fullmatch(r"mp3|wav|flac|ogg|m4a", suffix) else "mp3"


async def main(args: argparse.Namespace) -> int:
    settings = Settings()
    manifest = json.loads(MANIFEST.read_text())["songs"]
    chosen = [s for s in manifest if not args.only or s["slug"] in args.only]
    engine = create_engine(settings.database_url)
    sessions = create_session_factory(engine)
    analyses, projects, songs = (
        SqlAlchemyAnalysisRepository(sessions),
        SqlAlchemyProjectRepository(sessions),
        SqlAlchemySongRepository(sessions),
    )
    store = build_object_store(settings)
    local = _is_local(settings)
    analyze = AnalyzeAudio(
        analyses, store, FfmpegDecoder(), DemucsSeparator(settings.demucs_model), BasicPitchTranscriber(),
        LibrosaRhythmAnalyzer(), LibrosaStructureAnalyzer(), NoLyricsTranscriber(),
        min_velocity=settings.analysis_min_velocity, chroma=LibrosaChromaAnalyzer(),
    )  # fmt: skip
    failures = 0
    for entry in chosen:
        path = args.audio_dir / entry["file"]
        if not path.is_file():
            print(f"[seed] {entry['slug']}: file not found ({path})", file=sys.stderr)
            failures += 1
            continue
        if not entry["is_public"] and not local:
            print(f"[seed] {entry['slug']}: not public, refused on a remote object store", file=sys.stderr)
            failures += 1
            continue
        scratch = tempfile.TemporaryDirectory(prefix="mw-seed-")
        if entry.get(
            "excerpt_sec"
        ):  # a song over the analysis limit: keep its first seconds (stream copy, no re-encode)
            cut = Path(scratch.name) / f"excerpt{path.suffix}"
            subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-y",
                    "-i",
                    str(path),
                    "-t",
                    str(entry["excerpt_sec"]),
                    "-c",
                    "copy",
                    str(cut),
                ],
                check=True,
            )
            path = cut
        audio_hash = _hash(path)
        existing = await songs.get_by_slug(entry["slug"])
        result = await analyses.get(audio_hash)
        if args.report:
            if result is None:
                print(f"[report] {entry['slug']}: no analysis stored")
                continue
            q = note_quality([(n.midi, n.duration, n.stem) for n in result.notes], result.key, result.duration_sec)
            print(f"[report] {entry['slug']}: key {result.key}, {q.notes} notes ({q.notes_per_second}/s), "
                  f"in key {q.in_key_ratio:.1%}, per stem {q.per_stem}")  # fmt: skip
            continue
        audio_key = f"audio/{audio_hash.removeprefix('sha256:')}.{_format(path)}"
        await store.put_file(audio_key, path, "audio/mpeg")
        if result is not None and args.force:
            async with sessions.begin() as s:
                row = await s.get(AnalysisRow, audio_hash)
                if row is not None:
                    await s.delete(row)
            result = None
        started = time.perf_counter()
        if result is None:
            result = await analyze.execute(AnalyzeAudioInput(audio_hash, audio_key), _progress(entry["slug"]))
            print(f"[seed] {entry['slug']}: analysed in {time.perf_counter() - started:.0f} s")
        project_id = existing.project_id if existing else None
        if project_id is None or await projects.get(project_id) is None:
            project_id = uuid7()
            await projects.add(
                Project(
                    id=project_id,
                    audio_hash=audio_hash,
                    audio_key=audio_key,
                    audio_format=_format(path),  # type: ignore[arg-type]
                    duration_sec=result.duration_sec,
                    lrc_text=None,
                    job_id=None,
                    created_at=utc_now(),
                    owner_id=None,
                )
            )
        await songs.upsert(
            Song(
                id=existing.id if existing else uuid7(),
                slug=entry["slug"],
                title=entry["title"],
                artist=entry["artist"],
                license=entry["license"],
                source_url=entry["source_url"],
                is_public=entry["is_public"],
                audio_hash=audio_hash,
                audio_key=audio_key,
                audio_format=_format(path),
                duration_sec=result.duration_sec,
                project_id=project_id,
                musical_key=result.key,
                tempo_bpm=result.tempo_bpm,
                note_count=len(result.notes),
                pipeline_version=PIPELINE_VERSION,
                created_at=existing.created_at if existing else utc_now(),
            )
        )
        scratch.cleanup()
        print(f"[seed] {entry['slug']}: {len(result.notes)} notes, {len(result.chords)} chords, key {result.key}, "
              f"{result.tempo_bpm:.0f} BPM, project {project_id}")  # fmt: skip
    await engine.dispose()
    return 1 if failures else 0


def _progress(slug: str):  # type: ignore[no-untyped-def]
    last = {"stage": ""}

    async def report(progress: float, stage: str | None = None) -> None:
        if stage and stage != last["stage"]:
            last["stage"] = stage
            print(f"[seed] {slug}: {stage} ({progress:.0%})", flush=True)

    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--audio-dir", type=Path, required=True)
    parser.add_argument("--only", action="append", help="slug to seed (repeatable); default: all")
    parser.add_argument("--force", action="store_true", help="recompute the stored analysis")
    parser.add_argument("--report", action="store_true", help="print note-quality proxies, change nothing")
    parsed = parser.parse_args()
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is required")
    raise SystemExit(asyncio.run(main(parsed)))
