"""Store templates: a validated `music-world.template.v1` document plus who published it and when."""

import base64
import binascii
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any

MAX_TEMPLATE_ID_LENGTH = 60
SUFFIX_LENGTH = 8
MAX_PAGE_SIZE = 50
DEFAULT_PAGE_SIZE = 24


class TemplateStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    HIDDEN = "hidden"  # reported too often: out of the gallery until reviewed


@dataclass(frozen=True)
class StoreTemplate:
    id: str  # UUIDv7 row id (the store id)
    owner_id: str
    template_id: str  # `document["id"]`: unique across the store
    author_name: str
    status: TemplateStatus
    document: Mapping[str, Any]
    created_at: datetime
    published_at: datetime | None = None
    thumbnail_key: str | None = None
    thumbnail_type: str | None = None
    featured: bool = False
    report_count: int = 0

    def visible_to(self, caller_id: str | None) -> bool:
        """Published templates are public; drafts and hidden ones only exist for their owner (404 otherwise)."""
        return self.status is TemplateStatus.PUBLISHED or (caller_id is not None and caller_id == self.owner_id)


def store_template_id(submitted_id: str, row_id: str) -> str:
    """`<submitted id>-<8 hex of the row id>` (≤ 60 chars, kebab-case): two creators may reuse the same name."""
    suffix = row_id.replace("-", "")[-SUFFIX_LENGTH:].lower()
    base = submitted_id[: MAX_TEMPLATE_ID_LENGTH - SUFFIX_LENGTH - 1].rstrip("-")
    return f"{base}-{suffix}" if base else f"template-{suffix}"


@dataclass(frozen=True)
class PageCursor:
    """Position after the last item of a page, newest first: `(published_at, id)`."""

    published_at: datetime
    id: str

    def encode(self) -> str:
        raw = f"{self.published_at.isoformat()}|{self.id}".encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    @staticmethod
    def decode(value: str) -> "PageCursor | None":
        """None for anything that is not a cursor produced by `encode` (an invalid cursor restarts the list)."""
        if len(value) > 200 or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
            return None
        try:
            text = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode()
            stamp, row_id = text.split("|", 1)
            published = datetime.fromisoformat(stamp)
        except (binascii.Error, UnicodeDecodeError, ValueError):
            return None
        if published.tzinfo is None:
            return None
        return PageCursor(published, row_id)


@dataclass(frozen=True)
class TemplatePage:
    items: list[StoreTemplate]
    next_cursor: str | None
