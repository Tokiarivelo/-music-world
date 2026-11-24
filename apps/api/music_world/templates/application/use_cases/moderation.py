"""Moderation use cases: review the hidden queue, restore or remove (10-template-moderation requirements 2, 3)."""

from dataclasses import dataclass, replace
from datetime import datetime

import structlog

from music_world.templates.application.ports import (
    Clock,
    IdGenerator,
    ModerationAudit,
    ReportRepository,
    StoreTemplateRepository,
)
from music_world.templates.domain.errors import StoreTemplateNotFoundError, TemplateNotHiddenError
from music_world.templates.domain.model import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    ModerationAction,
    PageCursor,
    StoreTemplate,
    TemplateStatus,
)

log = structlog.get_logger(__name__)


@dataclass(frozen=True)
class QueueItem:
    template: StoreTemplate
    reasons: list[str]
    last_reported_at: datetime


@dataclass(frozen=True)
class QueuePage:
    items: list[QueueItem]
    next_cursor: PageCursor | None


async def _hidden(repo: StoreTemplateRepository, template_id: str) -> StoreTemplate:
    template = await repo.get(template_id)
    if template is None:
        raise StoreTemplateNotFoundError(f"template {template_id} not found")
    if template.status is not TemplateStatus.HIDDEN:
        raise TemplateNotHiddenError("this template is not hidden any more")
    return template


class ListHiddenTemplates:
    def __init__(self, repo: StoreTemplateRepository, reports: ReportRepository) -> None:
        self._repo, self._reports = repo, reports

    async def execute(self, after: PageCursor | None = None, limit: int = DEFAULT_PAGE_SIZE) -> QueuePage:
        limit = max(1, min(limit, MAX_PAGE_SIZE))
        rows = await self._repo.list_hidden(after, limit + 1)
        page = rows[:limit]
        items = [QueueItem(h.template, await self._reports.reasons(h.template.id), h.last_reported_at) for h in page]
        more = len(rows) > limit
        cursor = PageCursor(page[-1].last_reported_at, page[-1].template.id) if more and page else None
        return QueuePage(items, cursor)


class RestoreTemplate:
    """Back to `published`; existing reports are deleted and `reports_since` makes counting start from zero."""

    def __init__(
        self,
        repo: StoreTemplateRepository,
        reports: ReportRepository,
        audit: ModerationAudit,
        new_id: IdGenerator,
        clock: Clock,
    ) -> None:
        self._repo, self._reports, self._audit, self._new_id, self._clock = repo, reports, audit, new_id, clock

    async def execute(self, template_id: str, moderator_id: str) -> StoreTemplate:
        template = await _hidden(self._repo, template_id)
        now = self._clock()
        restored = replace(template, status=TemplateStatus.PUBLISHED, report_count=0, reports_since=now)
        await self._repo.save(restored)
        await self._reports.delete_for(template.id)
        await self._audit.record(ModerationAction(self._new_id(), template.id, moderator_id, "restore", now))
        log.info("moderation.restored", template_id=template.id, moderator_id=moderator_id)
        return restored


class RemoveTemplate:
    """Same effect as the owner's delete, plus the reports of the template."""

    def __init__(
        self,
        repo: StoreTemplateRepository,
        reports: ReportRepository,
        audit: ModerationAudit,
        new_id: IdGenerator,
        clock: Clock,
    ) -> None:
        self._repo, self._reports, self._audit, self._new_id, self._clock = repo, reports, audit, new_id, clock

    async def execute(self, template_id: str, moderator_id: str) -> None:
        template = await _hidden(self._repo, template_id)
        await self._repo.delete(template.id)
        await self._reports.delete_for(template.id)
        await self._audit.record(ModerationAction(self._new_id(), template.id, moderator_id, "remove", self._clock()))
        log.info("moderation.removed", template_id=template.id, moderator_id=moderator_id)
