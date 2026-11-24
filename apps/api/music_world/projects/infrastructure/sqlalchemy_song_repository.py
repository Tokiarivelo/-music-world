"""The catalog of seeded songs (table `songs`): metadata and the link to the project that holds the analysis."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Uuid, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import Mapped, mapped_column

from music_world.shared.db import Base


@dataclass(frozen=True)
class Song:
    id: str
    slug: str
    title: str
    artist: str
    license: str
    source_url: str | None
    is_public: bool
    audio_hash: str
    audio_key: str
    audio_format: str
    duration_sec: float
    project_id: str | None
    musical_key: str | None
    tempo_bpm: float | None
    note_count: int | None
    pipeline_version: str | None
    created_at: datetime


class SongRow(Base):
    __tablename__ = "songs"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    artist: Mapped[str] = mapped_column(String(200))
    license: Mapped[str] = mapped_column(String(120))
    source_url: Mapped[str | None] = mapped_column(String(400))
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    audio_hash: Mapped[str] = mapped_column(String(71), unique=True)
    audio_key: Mapped[str] = mapped_column(String(200))
    audio_format: Mapped[str] = mapped_column(String(8))
    duration_sec: Mapped[float] = mapped_column(Float)
    project_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    musical_key: Mapped[str | None] = mapped_column(String(32))
    tempo_bpm: Mapped[float | None] = mapped_column(Float)
    note_count: Mapped[int | None] = mapped_column(Integer)
    pipeline_version: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def _to_song(row: SongRow) -> Song:
    return Song(
        id=row.id, slug=row.slug, title=row.title, artist=row.artist, license=row.license,
        source_url=row.source_url, is_public=row.is_public, audio_hash=row.audio_hash, audio_key=row.audio_key,
        audio_format=row.audio_format, duration_sec=row.duration_sec, project_id=row.project_id,
        musical_key=row.musical_key, tempo_bpm=row.tempo_bpm, note_count=row.note_count,
        pipeline_version=row.pipeline_version, created_at=row.created_at,
    )  # fmt: skip


class SqlAlchemySongRepository:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def get_by_slug(self, slug: str) -> Song | None:
        async with self._sessions() as s:
            row = (await s.execute(select(SongRow).where(SongRow.slug == slug))).scalar_one_or_none()
            return _to_song(row) if row else None

    async def list_public(self) -> list[Song]:
        async with self._sessions() as s:
            rows = (await s.execute(select(SongRow).where(SongRow.is_public).order_by(SongRow.title))).scalars().all()
            return [_to_song(r) for r in rows]

    async def upsert(self, song: Song) -> None:
        """Insert, or replace the row with the same slug (the seed is re-runnable)."""
        async with self._sessions() as s, s.begin():
            row = (await s.execute(select(SongRow).where(SongRow.slug == song.slug))).scalar_one_or_none()
            values = {k: v for k, v in song.__dict__.items() if k != "id"}
            if row is None:
                s.add(SongRow(id=song.id, **values))
            else:
                for k, v in values.items():
                    setattr(row, k, v)
