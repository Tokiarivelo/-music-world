"""Finished analyses as JSON rows (`analyses` table), keyed by audio hash.

Deviation from design.md (S3 + row): the validated JSON lives in the row itself (≤ ~1 MB for 3 minutes), so the
cache works without object storage. Stems and stage checkpoints stay in object storage.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, String, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import Mapped, mapped_column

from music_world.schemas.analysis import SCHEMA_ID, AnalysisResult
from music_world.shared.clock import utc_now
from music_world.shared.db import Base


class AnalysisRow(Base):
    __tablename__ = "analyses"

    audio_hash: Mapped[str] = mapped_column(String(71), primary_key=True)
    schema_id: Mapped[str] = mapped_column(String(64))
    result: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SqlAlchemyAnalysisRepository:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def exists(self, audio_hash: str) -> bool:
        async with self._sessions() as session:
            found = await session.scalar(
                select(AnalysisRow.audio_hash).where(
                    AnalysisRow.audio_hash == audio_hash, AnalysisRow.schema_id == SCHEMA_ID
                )
            )
            return found is not None

    async def get(self, audio_hash: str) -> AnalysisResult | None:
        async with self._sessions() as session:
            row = await session.get(AnalysisRow, audio_hash)
            if row is None or row.schema_id != SCHEMA_ID:
                return None  # an older contract version is re-analysed
            return AnalysisResult.model_validate(row.result)

    async def save(self, result: AnalysisResult) -> None:
        doc = result.model_dump(mode="json", by_alias=True)
        async with self._sessions.begin() as session:
            row = await session.get(AnalysisRow, result.audio_hash)
            if row is None:
                row = AnalysisRow(audio_hash=result.audio_hash)
                session.add(row)
            row.schema_id, row.result, row.created_at = SCHEMA_ID, doc, utc_now()
