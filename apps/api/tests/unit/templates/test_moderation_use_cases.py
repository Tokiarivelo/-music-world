import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from music_world.shared.container import build_templates
from music_world.shared.settings import Settings
from music_world.templates.domain.errors import StoreTemplateNotFoundError, TemplateNotHiddenError
from music_world.templates.domain.model import StoreTemplate, TemplateStatus
from tests.fakes import (
    FakeClock,
    InMemoryModerationAudit,
    InMemoryObjectStore,
    InMemoryReportRepository,
    InMemoryStoreTemplateRepository,
    SequentialIds,
)
from tests.unit.templates.helpers import NEON

T0 = datetime(2026, 11, 1, tzinfo=UTC)
OWNER, MOD = "00000000-0000-7000-8000-00000000000a", "00000000-0000-7000-8000-0000000000ff"


def _row(n: int, status: TemplateStatus = TemplateStatus.HIDDEN) -> StoreTemplate:
    return StoreTemplate(
        id=f"00000000-0000-7000-8000-{n:012d}",
        owner_id=OWNER,
        template_id=f"neon-{n}",
        author_name="creator-abc",
        status=status,
        document={**NEON, "id": f"neon-{n}"},
        created_at=T0 + timedelta(minutes=n),
        published_at=T0 + timedelta(minutes=n),
    )


class NoFeatured:
    def all(self) -> list[StoreTemplate]:
        return []


def _world(threshold: int = 3):  # type: ignore[no-untyped-def]
    repo, reports, audit, clock = (
        InMemoryStoreTemplateRepository(),
        InMemoryReportRepository(),
        InMemoryAudit(),
        FakeClock(),
    )
    services = build_templates(
        Settings(app_env="test", template_report_hide_threshold=threshold),
        repo,
        InMemoryObjectStore(),
        reports,
        audit,
        NoFeatured(),
        new_id=SequentialIds(),
        clock=clock,
    )
    return services, repo, reports, audit, clock


InMemoryAudit = InMemoryModerationAudit


async def test_queue_lists_hidden_templates_with_reasons_newest_report_first() -> None:
    services, repo, reports, *_ = _world()
    for n in (1, 2):
        await repo.add(_row(n))
    await repo.add(_row(3, TemplateStatus.PUBLISHED))
    from music_world.templates.domain.model import TemplateReport

    await reports.add(TemplateReport(_row(1).id, "u1", "spam", T0 + timedelta(hours=2)))
    await reports.add(TemplateReport(_row(2).id, "u2", "abuse", T0 + timedelta(hours=1)))
    repo.last_reported = {_row(1).id: T0 + timedelta(hours=2), _row(2).id: T0 + timedelta(hours=1)}
    page = await services.list_hidden.execute(None, 1)
    assert [i.template.id for i in page.items] == [_row(1).id] and page.items[0].reasons == ["spam"]
    assert page.next_cursor is not None
    rest = await services.list_hidden.execute(page.next_cursor, 1)
    assert [i.template.id for i in rest.items] == [_row(2).id] and rest.next_cursor is None


async def test_restore_publishes_clears_reports_and_writes_an_audit_row() -> None:
    services, repo, reports, audit, _ = _world()
    await repo.add(_row(1))
    from music_world.templates.domain.model import TemplateReport

    await reports.add(TemplateReport(_row(1).id, "u1", "spam", T0))
    restored = await services.restore.execute(_row(1).id, MOD)
    assert restored.status is TemplateStatus.PUBLISHED and restored.report_count == 0
    assert restored.reports_since is not None and await reports.count(_row(1).id) == 0
    assert [(a.action, a.moderator_id, a.template_id) for a in audit.actions] == [("restore", MOD, _row(1).id)]
    with pytest.raises(TemplateNotHiddenError):  # already restored
        await services.restore.execute(_row(1).id, MOD)


async def test_remove_deletes_template_and_reports_and_audits() -> None:
    services, repo, reports, audit, _ = _world()
    await repo.add(_row(1))
    from music_world.templates.domain.model import TemplateReport

    await reports.add(TemplateReport(_row(1).id, "u1", "spam", T0))
    await services.remove.execute(_row(1).id, MOD)
    assert await repo.get(_row(1).id) is None and not reports.reports
    assert [a.action for a in audit.actions] == ["remove"]


async def test_decisions_on_missing_or_visible_templates_fail() -> None:
    services, repo, *_ = _world()
    await repo.add(_row(1, TemplateStatus.PUBLISHED))
    with pytest.raises(StoreTemplateNotFoundError):
        await services.remove.execute(_row(2).id, MOD)
    with pytest.raises(TemplateNotHiddenError):
        await services.remove.execute(_row(1).id, MOD)


async def _restore_then_report(old: int, new: int, threshold: int) -> tuple[TemplateStatus, int]:
    services, repo, *_ = _world(threshold)
    template = _row(1, TemplateStatus.PUBLISHED)
    await repo.add(template)
    for i in range(old):
        if (await repo.get(template.id)).status is TemplateStatus.HIDDEN:  # type: ignore[union-attr]
            break  # a hidden template is no longer visible, so it cannot be reported
        await services.report.execute(template.id, f"00000000-0000-7000-8000-0000000001{i:02d}", "spam")
    stored = await repo.get(template.id)
    assert stored is not None
    carried = old  # reports that still count when no restore happened
    if stored.status is TemplateStatus.HIDDEN:
        await services.restore.execute(template.id, MOD)
        carried = 0
    for i in range(new):
        if (await repo.get(template.id)).status is TemplateStatus.HIDDEN:  # type: ignore[union-attr]
            break
        await services.report.execute(template.id, f"00000000-0000-7000-8000-0000000002{i:02d}", "spam")
    final = await repo.get(template.id)
    assert final is not None
    return final.status, carried + new


@settings(max_examples=40, deadline=None)
@given(old=st.integers(0, 6), new=st.integers(0, 6), threshold=st.integers(2, 5))
def test_reports_after_a_restore_never_hide_before_the_threshold(old: int, new: int, threshold: int) -> None:
    status, count = asyncio.run(_restore_then_report(old, new, threshold))
    assert (status is TemplateStatus.HIDDEN) == (count >= threshold)
