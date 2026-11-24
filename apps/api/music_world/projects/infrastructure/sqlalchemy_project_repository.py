from datetime import UTC, datetime
from typing import cast

from sqlalchemy import DateTime, Float, String, Text, Uuid
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import Mapped, mapped_column

from music_world.projects.domain.project import AudioFormat, Project
from music_world.shared.db import Base


class ProjectRow(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    audio_hash: Mapped[str] = mapped_column(String(71), index=True)
    audio_key: Mapped[str] = mapped_column(String(200))
    audio_format: Mapped[str] = mapped_column(String(8))
    duration_sec: Mapped[float] = mapped_column(Float)
    lrc_text: Mapped[str | None] = mapped_column(Text)
    job_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    owner_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), index=True)


def _to_domain(row: ProjectRow) -> Project:
    created = row.created_at if row.created_at.tzinfo else row.created_at.replace(tzinfo=UTC)
    return Project(
        id=str(row.id),
        audio_hash=row.audio_hash,
        audio_key=row.audio_key,
        audio_format=cast(AudioFormat, row.audio_format),
        duration_sec=row.duration_sec,
        lrc_text=row.lrc_text,
        job_id=str(row.job_id) if row.job_id else None,
        created_at=created,
        owner_id=str(row.owner_id) if row.owner_id else None,
    )


def _apply(row: ProjectRow, p: Project) -> None:
    row.audio_hash, row.audio_key, row.audio_format = p.audio_hash, p.audio_key, p.audio_format
    row.duration_sec, row.lrc_text, row.job_id, row.created_at = p.duration_sec, p.lrc_text, p.job_id, p.created_at
    row.owner_id = p.owner_id


class SqlAlchemyProjectRepository:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def add(self, project: Project) -> None:
        async with self._sessions.begin() as session:
            row = ProjectRow(id=project.id)
            _apply(row, project)
            session.add(row)

    async def get(self, project_id: str) -> Project | None:
        async with self._sessions() as session:
            row = await session.get(ProjectRow, project_id)
            return _to_domain(row) if row else None

    async def save(self, project: Project) -> None:
        async with self._sessions.begin() as session:
            row = await session.get(ProjectRow, project.id)
            if row is None:
                row = ProjectRow(id=project.id)
                session.add(row)
            _apply(row, project)
