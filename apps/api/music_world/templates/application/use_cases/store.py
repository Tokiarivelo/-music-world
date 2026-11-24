"""Template store use cases: create / publish / thumbnail / delete (owner only) and public reads (requirements 3, 4)."""

from dataclasses import dataclass, replace
from typing import Any

import structlog

from music_world.templates.application.ports import (
    Clock,
    FeaturedCatalog,
    IdGenerator,
    KeyGenerator,
    ReportRepository,
    StoreTemplateRepository,
    ThumbnailStore,
)
from music_world.templates.application.validation import validated_document
from music_world.templates.domain.errors import StoreTemplateNotFoundError, TemplateNotReportableError
from music_world.templates.domain.model import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    PageCursor,
    StoreTemplate,
    TemplatePage,
    TemplateReport,
    TemplateStatus,
    store_template_id,
)
from music_world.templates.domain.thumbnail import check_thumbnail

log = structlog.get_logger(__name__)


def _not_found(template_id: str) -> StoreTemplateNotFoundError:
    return StoreTemplateNotFoundError(f"template {template_id} not found")


async def _owned(repo: StoreTemplateRepository, template_id: str, caller_id: str) -> StoreTemplate:
    """Drafts and templates of other creators answer 404: existence never leaks."""
    template = await repo.get(template_id)
    if template is None or template.owner_id != caller_id:
        raise _not_found(template_id)
    return template


@dataclass(frozen=True)
class CreateTemplateCommand:
    owner_id: str
    author_name: str
    template: Any  # untrusted JSON from the request
    publish: bool = False
    raw_size: int = 0


class CreateStoreTemplate:
    def __init__(self, repo: StoreTemplateRepository, new_id: IdGenerator, clock: Clock) -> None:
        self._repo, self._new_id, self._clock = repo, new_id, clock

    async def execute(self, cmd: CreateTemplateCommand) -> StoreTemplate:
        doc = validated_document(cmd.template, raw_size=cmd.raw_size)
        row_id, now = self._new_id(), self._clock()
        doc["id"] = store_template_id(str(doc["id"]), row_id)
        stored = StoreTemplate(
            id=row_id,
            owner_id=cmd.owner_id,
            template_id=doc["id"],
            author_name=cmd.author_name,
            status=TemplateStatus.PUBLISHED if cmd.publish else TemplateStatus.DRAFT,
            document=doc,
            created_at=now,
            published_at=now if cmd.publish else None,
        )
        await self._repo.add(stored)
        log.info("templates.created", template_id=row_id, owner_id=cmd.owner_id, status=stored.status.value)
        return stored


class PublishStoreTemplate:
    def __init__(self, repo: StoreTemplateRepository, clock: Clock) -> None:
        self._repo, self._clock = repo, clock

    async def execute(self, template_id: str, caller_id: str) -> StoreTemplate:
        template = await _owned(self._repo, template_id, caller_id)
        if template.status is TemplateStatus.DRAFT:
            template = replace(template, status=TemplateStatus.PUBLISHED, published_at=self._clock())
            await self._repo.save(template)
        return template


class SetThumbnail:
    def __init__(self, repo: StoreTemplateRepository, store: ThumbnailStore, new_key: KeyGenerator) -> None:
        self._repo, self._store, self._new_key = repo, store, new_key

    async def execute(self, template_id: str, caller_id: str, data: bytes) -> StoreTemplate:
        template = await _owned(self._repo, template_id, caller_id)
        info = check_thumbnail(data)
        key = f"templates/thumbnails/{self._new_key()}.{info.extension}"  # random key, never the client file name
        await self._store.put_bytes(key, data, info.content_type)
        template = replace(template, thumbnail_key=key, thumbnail_type=info.content_type)
        await self._repo.save(template)
        return template


class DeleteStoreTemplate:
    def __init__(self, repo: StoreTemplateRepository) -> None:
        self._repo = repo

    async def execute(self, template_id: str, caller_id: str) -> None:
        await _owned(self._repo, template_id, caller_id)
        await self._repo.delete(template_id)


class GetStoreTemplate:
    def __init__(self, repo: StoreTemplateRepository, featured: FeaturedCatalog) -> None:
        self._repo, self._featured = repo, featured

    async def execute(self, template_id: str, caller_id: str | None) -> StoreTemplate:
        for featured in self._featured.all():
            if featured.id == template_id:
                return featured
        template = await self._repo.get(template_id)
        if template is None or not template.visible_to(caller_id):
            raise _not_found(template_id)
        return template


@dataclass(frozen=True)
class Thumbnail:
    data: bytes
    content_type: str


class GetThumbnail:
    def __init__(self, get_template: GetStoreTemplate, store: ThumbnailStore) -> None:
        self._get, self._store = get_template, store

    async def execute(self, template_id: str, caller_id: str | None) -> Thumbnail:
        template = await self._get.execute(template_id, caller_id)
        data = await self._store.get_bytes(template.thumbnail_key) if template.thumbnail_key else None
        if data is None or template.thumbnail_type is None:
            raise _not_found(template_id)
        return Thumbnail(data, template.thumbnail_type)


def page_size(limit: int | None) -> int:
    return max(1, min(limit or DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))


class ListPublishedTemplates:
    """Newest published first; the featured (launch) templates head the first page (requirement 5.1)."""

    def __init__(self, repo: StoreTemplateRepository, featured: FeaturedCatalog) -> None:
        self._repo, self._featured = repo, featured

    async def execute(self, cursor: str | None, limit: int | None) -> TemplatePage:
        size = page_size(limit)
        after = PageCursor.decode(cursor) if cursor else None
        rows = await self._repo.list_published(after, size + 1)
        more = len(rows) > size
        rows = rows[:size]
        last = rows[-1] if more and rows else None
        next_cursor = PageCursor(last.published_at, last.id).encode() if last and last.published_at else None
        items = [*self._featured.all(), *rows] if after is None else rows
        return TemplatePage(items, next_cursor)


class ListMyTemplates:
    def __init__(self, repo: StoreTemplateRepository) -> None:
        self._repo = repo

    async def execute(self, caller_id: str) -> TemplatePage:
        return TemplatePage(await self._repo.list_by_owner(caller_id, MAX_PAGE_SIZE), None)


class ReportTemplate:
    """One report per user and template; at `hide_threshold` distinct reports the template leaves the gallery
    (status `hidden`, still visible to its owner) until reviewed (requirement 6)."""

    def __init__(
        self,
        repo: StoreTemplateRepository,
        reports: ReportRepository,
        get_template: GetStoreTemplate,
        clock: Clock,
        *,
        hide_threshold: int,
    ) -> None:
        self._repo, self._reports, self._get, self._clock = repo, reports, get_template, clock
        self._threshold = hide_threshold

    async def execute(self, template_id: str, caller_id: str, reason: str) -> None:
        template = await self._get.execute(template_id, caller_id)
        if template.featured or template.owner_id == caller_id:
            raise TemplateNotReportableError("this template cannot be reported")
        if not await self._reports.add(TemplateReport(template.id, caller_id, reason, self._clock())):
            return  # already reported by this user: idempotent
        count = await self._reports.count(template.id)
        status = TemplateStatus.HIDDEN if count >= self._threshold else template.status
        await self._repo.save(replace(template, report_count=count, status=status))
        log.info("templates.reported", template_id=template.id, reason=reason, reports=count, status=status.value)
