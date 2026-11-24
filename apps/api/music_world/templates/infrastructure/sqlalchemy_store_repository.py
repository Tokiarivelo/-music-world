"""SQLAlchemy adapter of `StoreTemplateRepository` (table `store_templates`, migration `0003_accounts_templates`)."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, Uuid, and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import Mapped, mapped_column

from music_world.shared.db import Base
from music_world.templates.domain.model import PageCursor, StoreTemplate, TemplateStatus


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


class StoreTemplateRow(Base):
    __tablename__ = "store_templates"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    owner_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), index=True)
    template_id: Mapped[str] = mapped_column(String(60), unique=True)
    author_name: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(16))
    document: Mapped[dict[str, Any]] = mapped_column(JSON)
    thumbnail_key: Mapped[str | None] = mapped_column(String(200))
    thumbnail_type: Mapped[str | None] = mapped_column(String(32))
    report_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


def _to_domain(row: StoreTemplateRow) -> StoreTemplate:
    return StoreTemplate(
        id=str(row.id),
        owner_id=str(row.owner_id),
        template_id=row.template_id,
        author_name=row.author_name,
        status=TemplateStatus(row.status),
        document=row.document,
        created_at=_utc(row.created_at) or row.created_at,
        published_at=_utc(row.published_at),
        thumbnail_key=row.thumbnail_key,
        thumbnail_type=row.thumbnail_type,
        report_count=row.report_count,
    )


def _apply(row: StoreTemplateRow, t: StoreTemplate) -> None:
    row.owner_id, row.template_id, row.author_name, row.status = t.owner_id, t.template_id, t.author_name, t.status
    row.document, row.thumbnail_key, row.thumbnail_type = dict(t.document), t.thumbnail_key, t.thumbnail_type
    row.report_count, row.created_at, row.published_at = t.report_count, t.created_at, t.published_at


class SqlAlchemyStoreTemplateRepository:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def add(self, template: StoreTemplate) -> None:
        async with self._sessions.begin() as s:
            row = StoreTemplateRow(id=template.id)
            _apply(row, template)
            s.add(row)

    async def get(self, template_id: str) -> StoreTemplate | None:
        async with self._sessions() as s:
            row = await s.get(StoreTemplateRow, template_id)
            return _to_domain(row) if row else None

    async def save(self, template: StoreTemplate) -> None:
        async with self._sessions.begin() as s:
            row = await s.get(StoreTemplateRow, template.id)
            if row is None:
                row = StoreTemplateRow(id=template.id)
                s.add(row)
            _apply(row, template)

    async def delete(self, template_id: str) -> None:
        async with self._sessions.begin() as s:
            await s.execute(delete(StoreTemplateRow).where(StoreTemplateRow.id == template_id))

    async def list_published(self, after: PageCursor | None, limit: int) -> list[StoreTemplate]:
        query = select(StoreTemplateRow).where(StoreTemplateRow.status == TemplateStatus.PUBLISHED.value)
        if after is not None:
            published, row_id = StoreTemplateRow.published_at, StoreTemplateRow.id
            query = query.where(
                or_(published < after.published_at, and_(published == after.published_at, row_id < after.id))
            )
        query = query.order_by(StoreTemplateRow.published_at.desc(), StoreTemplateRow.id.desc()).limit(limit)
        async with self._sessions() as s:
            return [_to_domain(row) for row in (await s.execute(query)).scalars()]

    async def list_by_owner(self, owner_id: str, limit: int) -> list[StoreTemplate]:
        query = (
            select(StoreTemplateRow)
            .where(StoreTemplateRow.owner_id == owner_id)
            .order_by(StoreTemplateRow.created_at.desc())
            .limit(limit)
        )
        async with self._sessions() as s:
            return [_to_domain(row) for row in (await s.execute(query)).scalars()]
