from collections.abc import AsyncIterator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from music_world.shared.db import Base, create_engine, create_session_factory
from music_world.templates.domain.model import (
    ModerationAction,
    PageCursor,
    StoreTemplate,
    TemplateReport,
    TemplateStatus,
)
from music_world.templates.infrastructure.featured_catalog import FileFeaturedCatalog
from music_world.templates.infrastructure.sqlalchemy_store_repository import (
    SqlAlchemyModerationAudit,
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


USERS = [f"00000000-0000-7000-8000-0000000001{n:02d}" for n in range(4)]


async def test_hidden_queue_is_ordered_by_latest_report_and_paginates(repo: SqlAlchemyStoreTemplateRepository) -> None:
    reports = SqlAlchemyReportRepository(repo._sessions)
    for n in (1, 2, 3):
        await repo.add(_row(n, TemplateStatus.HIDDEN))
    await repo.add(_row(4))  # published: not in the queue
    # template 2 was reported last, template 1 first
    await reports.add(TemplateReport(_row(1).id, USERS[0], "spam", T0 + timedelta(hours=1)))
    await reports.add(TemplateReport(_row(3).id, USERS[0], "abuse", T0 + timedelta(hours=2)))
    await reports.add(TemplateReport(_row(2).id, USERS[1], "other", T0 + timedelta(hours=3)))
    first = await repo.list_hidden(None, 2)
    assert [h.template.id for h in first] == [_row(2).id, _row(3).id]
    assert first[0].last_reported_at == T0 + timedelta(hours=3)
    cursor = PageCursor(first[-1].last_reported_at, first[-1].template.id)
    assert [h.template.id for h in await repo.list_hidden(cursor, 2)] == [_row(1).id]


async def test_reports_since_marker_reasons_and_delete(repo: SqlAlchemyStoreTemplateRepository) -> None:
    reports = SqlAlchemyReportRepository(repo._sessions)
    template = replace(_row(1, TemplateStatus.HIDDEN), reports_since=T0 + timedelta(hours=1))
    await repo.add(template)
    assert (await repo.get(template.id)) == template
    await reports.add(TemplateReport(template.id, USERS[0], "spam", T0))
    await reports.add(TemplateReport(template.id, USERS[1], "abuse", T0 + timedelta(hours=2)))
    assert await reports.count(template.id) == 2
    assert await reports.count(template.id, template.reports_since) == 1
    assert await reports.reasons(template.id) == ["abuse", "spam"]
    await reports.delete_for(template.id)
    assert await reports.count(template.id) == 0 and await reports.reasons(template.id) == []


async def test_moderation_audit_row_is_stored(repo: SqlAlchemyStoreTemplateRepository) -> None:
    audit = SqlAlchemyModerationAudit(repo._sessions)
    action = ModerationAction("00000000-0000-7000-8000-0000000009aa", _row(1).id, USERS[0], "restore", T0)
    await audit.record(action)
    async with repo._sessions() as s:
        from music_world.templates.infrastructure.sqlalchemy_store_repository import ModerationActionRow

        row = await s.get(ModerationActionRow, action.id)
    assert row is not None and (row.action, row.moderator_id, row.template_id) == ("restore", USERS[0], _row(1).id)
