"""Template store contracts (06-template-store requirements 3, 4)."""

from datetime import datetime
from typing import Any, Literal

from pydantic import ConfigDict, Field

from music_world.schemas.base import ContractModel
from music_world.schemas.template import WorldTemplate

TEMPLATE_SCHEMA_ID = "music-world.store-template.v1"
PAGE_SCHEMA_ID = "music-world.store-template-page.v1"


class StoreAuthor(ContractModel):
    display_name: str = Field(description="Public name (never the e-mail address).")


class StoreTemplate(ContractModel):
    """One template of the store: its `music-world.template.v1` document plus publication data."""

    model_config = ConfigDict(title="StoreTemplate")

    id: str = Field(description="Store id (UUID): use it in `/api/templates/{id}` and `?template=`.")
    template: WorldTemplate = Field(description="Its `id` is unique across the store.")
    status: Literal["draft", "published", "hidden"]
    author: StoreAuthor
    featured: bool = Field(description="Launch template shipped with Music World.")
    thumbnail_url: str | None = Field(description="Same-origin URL of the thumbnail, or null (draw a palette preview).")
    created_at: datetime
    published_at: datetime | None


class StoreTemplatePage(ContractModel):
    """`GET /api/templates` (published, newest first, featured first) and `GET /api/templates/mine`."""

    model_config = ConfigDict(title="StoreTemplatePage")

    items: list[StoreTemplate]
    next_cursor: str | None = Field(description="Pass as `?cursor=` for the next page; null on the last page.")


class CreateStoreTemplateRequest(ContractModel):
    model_config = ConfigDict(
        json_schema_extra={"examples": [{"template": {"schema": "music-world.template.v1", "…": "…"}, "publish": True}]}
    )

    template: dict[str, Any] = Field(description="A `music-world.template.v1` document (validated by the store).")
    publish: bool = Field(default=False, description="Publish at once instead of keeping a draft.")
