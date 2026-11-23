from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, String, Uuid
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import Mapped, mapped_column

from music_world.projects.domain.job import Job, JobStatus
from music_world.shared.db import Base


class JobRow(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    kind: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), index=True)
    stage: Mapped[str | None] = mapped_column(String(64))
    progress: Mapped[float] = mapped_column(Float)
    error: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    subject_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)  # SQLite drops the offset


def _to_domain(row: JobRow) -> Job:
    return Job(
        id=str(row.id),
        kind=row.kind,
        status=JobStatus(row.status),
        progress=row.progress,
        stage=row.stage,
        error=row.error,
        created_at=_utc(row.created_at),
        updated_at=_utc(row.updated_at),
        subject_id=str(row.subject_id) if row.subject_id else None,
    )


def _apply(row: JobRow, job: Job) -> None:
    row.kind, row.status, row.stage = job.kind, job.status.value, job.stage
    row.progress, row.error, row.created_at, row.updated_at = job.progress, job.error, job.created_at, job.updated_at
    row.subject_id = job.subject_id


class SqlAlchemyJobRepository:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def add(self, job: Job) -> None:
        async with self._sessions.begin() as session:
            row = JobRow(id=job.id)
            _apply(row, job)
            session.add(row)

    async def get(self, job_id: str) -> Job | None:
        async with self._sessions() as session:
            row = await session.get(JobRow, job_id)
            return _to_domain(row) if row else None

    async def save(self, job: Job) -> None:
        async with self._sessions.begin() as session:
            row = await session.get(JobRow, job.id)
            if row is None:
                row = JobRow(id=job.id)
                session.add(row)
            _apply(row, job)
