from collections.abc import AsyncIterator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from music_world.shared.db import Base, create_engine, create_session_factory
from music_world.templates.domain.model import PageCursor, StoreTemplate, TemplateReport, TemplateStatus
from music_world.templates.infrastructure.featured_catalog import FileFeaturedCatalog
from music_world.templates.infrastructure.sqlalchemy_store_repository import (
    SqlAlchemyReportRepository,
    SqlAlchemyStoreTemplateRepository,
)
from tests.unit.templates.helpers import NEON

T0 = datetime(2026, 11, 26, 10, 0, tzinfo=UTC)
OWNER = "00000000-0000-7000-8000-00000000000a"


@pytest.fixture
async def repo() -> AsyncIterator[SqlAlchemyStoreTemplateRepository]:
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield SqlAlchemyStoreTemplateRepository(create_session_factory(engine))
    await engine.dispose()


def _row(n: int, status: TemplateStatus = TemplateStatus.PUBLISHED, published: datetime | None = None) -> StoreTemplate:
    return StoreTemplate(
        id=f"00000000-0000-7000-8000-{n:012d}",
        owner_id=OWNER,
        template_id=f"neon-{n}",
        author_name="creator-abc",
        status=status,
        document={**NEON, "id": f"neon-{n}"},
        created_at=T0 + timedelta(minutes=n),
        published_at=published if published is not None else T0 + timedelta(minutes=n),
    )


async def test_round_trip_save_delete(repo: SqlAlchemyStoreTemplateRepository) -> None:
    row = _row(1, TemplateStatus.DRAFT)
    row = replace(row, published_at=None)
    await repo.add(row)
    assert await repo.get(row.id) == row
    updated = replace(
        row, status=TemplateStatus.PUBLISHED, published_at=T0, thumbnail_key="k", thumbnail_type="image/png"
    )
    await repo.save(updated)
    assert await repo.get(row.id) == updated
    await repo.delete(row.id)
    assert await repo.get(row.id) is None


async def test_published_pagination_handles_equal_timestamps(repo: SqlAlchemyStoreTemplateRepository) -> None:
    for n in range(1, 6):
        await repo.add(_row(n, published=T0))  # same publication time: the id breaks ties
    await repo.add(_row(9, TemplateStatus.DRAFT))
    first = await repo.list_published(None, 2)
    assert [t.template_id for t in first] == ["neon-5", "neon-4"]
    rest = await repo.list_published(PageCursor(T0, first[-1].id), 10)
    assert [t.template_id for t in rest] == ["neon-3", "neon-2", "neon-1"]
    assert len(await repo.list_by_owner(OWNER, 50)) == 6


def test_featured_catalog_loads_and_validates_files(tmp_path: Any) -> None:
    (tmp_path / "a.json").write_text(__import__("json").dumps(NEON))
    catalog = FileFeaturedCatalog({"00000000-0000-7000-8000-000000000001": "a.json"}, tmp_path)
    [item] = catalog.all()
    assert item.featured and item.author_name == "Music World" and item.template_id == "neon-nocturne"
    (tmp_path / "bad.json").write_text('{"schema": "music-world.template.v1"}')
    with pytest.raises(Exception, match="template is invalid"):
        FileFeaturedCatalog({"x": "bad.json"}, tmp_path)


async def test_reports_are_unique_per_user(repo: SqlAlchemyStoreTemplateRepository) -> None:
    reports = SqlAlchemyReportRepository(repo._sessions)
    tid = "00000000-0000-7000-8000-000000000001"
    assert await reports.add(TemplateReport(tid, OWNER, "spam", T0))
    assert not await reports.add(TemplateReport(tid, OWNER, "broken", T0))
    assert await reports.add(TemplateReport(tid, "00000000-0000-7000-8000-00000000000b", "spam", T0))
    assert await reports.count(tid) == 2 and await reports.count(OWNER) == 0
