from datetime import UTC, datetime, timedelta

import pytest

from music_world.shared.container import build_templates
from music_world.shared.settings import Settings
from music_world.templates.application.use_cases.store import CreateTemplateCommand
from music_world.templates.domain.errors import (
    StoreTemplateNotFoundError,
    TemplateInvalidError,
    TemplateNotReportableError,
)
from music_world.templates.domain.model import StoreTemplate, TemplateStatus
from tests.fakes import (
    FakeClock,
    InMemoryObjectStore,
    InMemoryReportRepository,
    InMemoryStoreTemplateRepository,
    SequentialIds,
)
from tests.unit.templates.helpers import png, template

T0 = datetime(2026, 11, 1, tzinfo=UTC)
ADA, BOB = "00000000-0000-7000-8000-00000000000a", "00000000-0000-7000-8000-00000000000b"


class NoFeatured:
    def __init__(self, items: list[StoreTemplate] | None = None) -> None:
        self.items = items or []

    def all(self) -> list[StoreTemplate]:
        return list(self.items)


def _services(featured: NoFeatured | None = None):  # type: ignore[no-untyped-def]
    repo, store, clock = InMemoryStoreTemplateRepository(), InMemoryObjectStore(), FakeClock()
    services = build_templates(
        Settings(app_env="test", template_report_hide_threshold=2),
        repo,
        store,
        InMemoryReportRepository(),
        featured or NoFeatured(),
        new_id=SequentialIds(),
        clock=clock,
    )
    return services, repo, store, clock


def _cmd(owner: str = ADA, publish: bool = False, **changes: object) -> CreateTemplateCommand:
    return CreateTemplateCommand(owner, "creator-ada", template(**changes), publish)


async def test_create_keeps_a_draft_with_a_unique_template_id_and_the_ai_label() -> None:
    services, *_ = _services()
    meta = {"generatedBy": {"provider": "mock", "model": "mock-director-1", "promptVersion": "director-v1"}}
    a = await services.create.execute(_cmd(meta=meta))
    b = await services.create.execute(_cmd(owner=BOB))
    assert a.status is TemplateStatus.DRAFT and a.published_at is None
    assert a.template_id != b.template_id and a.template_id.startswith("neon-nocturne-")
    assert a.document["id"] == a.template_id and a.document["meta"] == meta


async def test_invalid_templates_are_rejected_with_details() -> None:
    services, repo, *_ = _services()
    with pytest.raises(TemplateInvalidError) as error:
        await services.create.execute(_cmd(name="<b>x</b>"))
    assert error.value.details and not repo.templates


async def test_only_the_owner_sees_publishes_or_deletes_a_draft() -> None:
    services, repo, *_ = _services()
    draft = await services.create.execute(_cmd())
    for call in (
        services.get.execute(draft.id, BOB),
        services.get.execute(draft.id, None),
        services.publish.execute(draft.id, BOB),
        services.delete.execute(draft.id, BOB),
        services.set_thumbnail.execute(draft.id, BOB, png()),
    ):
        with pytest.raises(StoreTemplateNotFoundError):
            await call
    assert (await services.get.execute(draft.id, ADA)).id == draft.id
    published = await services.publish.execute(draft.id, ADA)
    assert published.status is TemplateStatus.PUBLISHED and published.published_at is not None
    assert (await services.get.execute(draft.id, None)).id == draft.id
    await services.delete.execute(draft.id, ADA)
    assert draft.id not in repo.templates


async def test_thumbnail_is_stored_under_a_random_key() -> None:
    services, _, store, _ = _services()
    created = await services.create.execute(_cmd(publish=True))
    updated = await services.set_thumbnail.execute(created.id, ADA, png())
    assert updated.thumbnail_key and updated.thumbnail_key.startswith("templates/thumbnails/")
    assert updated.thumbnail_key.endswith(".png") and updated.thumbnail_type == "image/png"
    thumb = await services.get_thumbnail.execute(created.id, None)
    assert thumb.data == png() and thumb.content_type == "image/png"
    with pytest.raises(StoreTemplateNotFoundError):
        await services.get_thumbnail.execute((await services.create.execute(_cmd(publish=True))).id, None)


async def test_gallery_pages_newest_first_with_featured_on_the_first_page_only() -> None:
    featured = StoreTemplate(
        "f-1", "system", "kiroween", "Music World", TemplateStatus.PUBLISHED, {}, T0, T0, featured=True
    )
    services, _, _, clock = _services(NoFeatured([featured]))
    ids = []
    for _ in range(5):
        ids.append((await services.create.execute(_cmd(publish=True))).id)
        clock.now += timedelta(minutes=1)
    await services.create.execute(_cmd())  # a draft never appears
    first = await services.list_published.execute(None, 2)
    second = await services.list_published.execute(first.next_cursor, 2)
    third = await services.list_published.execute(second.next_cursor, 2)
    assert [t.id for t in first.items] == ["f-1", ids[4], ids[3]]
    assert [t.id for t in second.items] == [ids[2], ids[1]]
    assert [t.id for t in third.items] == [ids[0]] and third.next_cursor is None
    assert (await services.get.execute("f-1", None)).featured
    mine = await services.list_mine.execute(ADA)
    assert len(mine.items) == 6 and mine.next_cursor is None


async def test_reports_hide_a_template_at_the_threshold_once_per_user() -> None:
    featured = StoreTemplate("f-1", "system", "k", "Music World", TemplateStatus.PUBLISHED, {}, T0, T0, featured=True)
    services, repo, *_ = _services(NoFeatured([featured]))
    t = await services.create.execute(_cmd(publish=True))
    for call in (services.report.execute(t.id, ADA, "spam"), services.report.execute("f-1", BOB, "spam")):
        with pytest.raises(TemplateNotReportableError):
            await call
    await services.report.execute(t.id, BOB, "spam")
    await services.report.execute(t.id, BOB, "offensive")  # same user again: ignored
    assert repo.templates[t.id].status is TemplateStatus.PUBLISHED and repo.templates[t.id].report_count == 1
    await services.report.execute(t.id, "00000000-0000-7000-8000-00000000000c", "broken")
    assert repo.templates[t.id].status is TemplateStatus.HIDDEN
    assert (await services.list_published.execute(None, None)).items == [featured]
    assert (await services.get.execute(t.id, ADA)).status is TemplateStatus.HIDDEN  # the owner still sees it
    with pytest.raises(StoreTemplateNotFoundError):
        await services.get.execute(t.id, BOB)
