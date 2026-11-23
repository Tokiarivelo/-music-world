from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest

from music_world.projects.domain.job import Job, JobStatus
from music_world.projects.infrastructure.sqlalchemy_job_repository import SqlAlchemyJobRepository
from music_world.shared.db import Base, create_engine, create_session_factory
from music_world.shared.ids import uuid7


@pytest.fixture
async def repo() -> AsyncIterator[SqlAlchemyJobRepository]:
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield SqlAlchemyJobRepository(create_session_factory(engine))
    await engine.dispose()


async def test_round_trip_keeps_every_field(repo: SqlAlchemyJobRepository) -> None:
    t0 = datetime(2026, 11, 23, 10, tzinfo=UTC)
    job = Job.queued(uuid7(), "demo", t0)
    await repo.add(job)
    job.start(t0)
    job.report(0.5, "step-2", t0)
    await repo.save(job)
    assert await repo.get(job.id) == job
    assert (await repo.get(job.id)) is not None and job.status is JobStatus.RUNNING


async def test_missing_job_is_none(repo: SqlAlchemyJobRepository) -> None:
    assert await repo.get(uuid7()) is None


def test_uuid7_is_versioned_and_time_ordered() -> None:
    ids = [uuid7() for _ in range(50)]
    assert all(i[14] == "7" and i[19] in "89ab" for i in ids)
    assert [i[:13] for i in ids] == sorted(i[:13] for i in ids)
