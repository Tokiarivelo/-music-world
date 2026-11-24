"""Ports of the template store (implemented in infrastructure/)."""

from collections.abc import Callable
from datetime import datetime
from typing import Protocol

from music_world.templates.domain.model import (
    HiddenTemplate,
    ModerationAction,
    PageCursor,
    StoreTemplate,
    TemplateReport,
)

Clock = Callable[[], datetime]
IdGenerator = Callable[[], str]
KeyGenerator = Callable[[], str]


class StoreTemplateRepository(Protocol):
    async def add(self, template: StoreTemplate) -> None: ...
    async def get(self, template_id: str) -> StoreTemplate | None: ...
    async def save(self, template: StoreTemplate) -> None: ...
    async def delete(self, template_id: str) -> None: ...

    async def list_published(self, after: PageCursor | None, limit: int) -> list[StoreTemplate]:
        """Published templates, newest first by `(published_at, id)`, strictly after `after`."""
        ...

    async def list_by_owner(self, owner_id: str, limit: int) -> list[StoreTemplate]: ...

    async def list_hidden(self, after: PageCursor | None, limit: int) -> list[HiddenTemplate]:
        """Hidden templates, latest report first by `(last_reported_at, id)`; the cursor's `published_at` carries
        the last report time."""
        ...


class FeaturedCatalog(Protocol):
    """Templates shipped with the app (launch templates): always published, never stored in the database."""

    def all(self) -> list[StoreTemplate]: ...


class ThumbnailStore(Protocol):
    async def put_bytes(self, key: str, data: bytes, content_type: str) -> None: ...
    async def get_bytes(self, key: str) -> bytes | None: ...


class ReportRepository(Protocol):
    async def add(self, report: TemplateReport) -> bool:
        """False when this user already reported this template (one report per user and template)."""
        ...

    async def count(self, template_id: str, since: datetime | None = None) -> int:
        """Reports of this template, only those created at or after `since` when given."""
        ...

    async def reasons(self, template_id: str) -> list[str]:
        """Reason codes of the current reports, newest first."""
        ...

    async def delete_for(self, template_id: str) -> None: ...


class ModerationAudit(Protocol):
    async def record(self, action: ModerationAction) -> None: ...
