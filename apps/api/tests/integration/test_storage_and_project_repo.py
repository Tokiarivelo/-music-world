import shutil
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path

import pytest

from music_world.analysis.infrastructure.sqlalchemy_analysis_repository import SqlAlchemyAnalysisRepository
from music_world.projects.domain.errors import AudioUnreadableError
from music_world.projects.domain.project import Project
from music_world.projects.infrastructure.ffprobe_audio_probe import FfprobeAudioProbe
from music_world.projects.infrastructure.sqlalchemy_project_repository import SqlAlchemyProjectRepository
from music_world.schemas.analysis import AnalysisResult
from music_world.shared.db import Base, create_engine, create_session_factory
from music_world.shared.ids import uuid7
from music_world.shared.object_store import LocalObjectStore
from tests.fakes import wav_bytes
from tests.unit.test_analysis_schema import _base


@pytest.fixture
async def sessions() -> AsyncIterator[object]:
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield create_session_factory(engine)
    await engine.dispose()


async def test_project_round_trip(sessions: object) -> None:
    repo = SqlAlchemyProjectRepository(sessions)  # type: ignore[arg-type]
    project = Project(
        uuid7(),
        "sha256:" + "a" * 64,
        "audio/a.wav",
        "wav",
        12.5,
        "[00:01.00]x",
        None,
        datetime(2026, 11, 23, tzinfo=UTC),
    )
    await repo.add(project)
    assert await repo.get(project.id) == project
    from dataclasses import replace

    updated = replace(project, job_id=uuid7())
    await repo.save(updated)
    assert await repo.get(project.id) == updated
    assert await repo.get(uuid7()) is None


async def test_analysis_repository_caches_by_hash(sessions: object) -> None:
    repo = SqlAlchemyAnalysisRepository(sessions)  # type: ignore[arg-type]
    result = AnalysisResult.model_validate(_base())
    assert not await repo.exists(result.audio_hash)
    await repo.save(result)
    await repo.save(result)  # idempotent
    assert await repo.exists(result.audio_hash)
    assert await repo.get(result.audio_hash) == result


async def test_local_object_store_round_trip_and_key_safety(tmp_path: Path) -> None:
    store = LocalObjectStore(tmp_path / "store")
    src = tmp_path / "src.bin"
    src.write_bytes(b"abc")
    await store.put_file("audio/x.wav", src, "audio/wav")
    await store.put_bytes("work/h/notes.json", b"{}", "application/json")
    assert await store.exists("audio/x.wav") and not await store.exists("audio/y.wav")
    assert await store.get_bytes("work/h/notes.json") == b"{}" and await store.get_bytes("nope") is None
    assert await store.get_file("audio/x.wav", tmp_path / "out" / "x.wav")
    assert (tmp_path / "out" / "x.wav").read_bytes() == b"abc"
    for bad in ("../escape", "/abs", ""):
        with pytest.raises(ValueError):
            await store.put_bytes(bad, b"", "x")


@pytest.mark.skipif(shutil.which("ffprobe") is None, reason="ffprobe not installed")
async def test_ffprobe_reads_duration_and_rejects_garbage(tmp_path: Path) -> None:
    good, bad = tmp_path / "a.wav", tmp_path / "b.wav"
    good.write_bytes(wav_bytes(seconds=1.25))
    bad.write_bytes(b"RIFF" + b"\x00" * 100)
    assert abs(await FfprobeAudioProbe().duration(good) - 1.25) < 0.01
    with pytest.raises(AudioUnreadableError):
        await FfprobeAudioProbe().duration(bad)
