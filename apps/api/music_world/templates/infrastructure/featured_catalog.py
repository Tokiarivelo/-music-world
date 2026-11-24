"""Launch templates shipped with the app (`featured/*.json`), validated like any submission at start-up."""

import json
from datetime import UTC, datetime
from pathlib import Path

from music_world.templates.application.validation import validated_document
from music_world.templates.domain.model import StoreTemplate, TemplateStatus

FEATURED_DIR = Path(__file__).parent / "featured"
FEATURED_AUTHOR = "Music World"
FEATURED_OWNER = "00000000-0000-7000-8000-000000000000"
KIROWEEN_STORE_ID = "00000000-0000-7000-8000-000000000001"
NEMO_STORE_ID = "00000000-0000-7000-8000-000000000002"
FEATURED_AT = datetime(2026, 11, 26, tzinfo=UTC)
# Store id → file. Fixed UUIDv7-shaped ids so links to a launch template never change.
FEATURED_FILES: dict[str, str] = {
    KIROWEEN_STORE_ID: "kiroween-pumpkin-night.json",  # Halloween launch template
    NEMO_STORE_ID: "nemo-reef.json",  # ocean launch template
}


class FileFeaturedCatalog:
    def __init__(self, files: dict[str, str] | None = None, directory: Path = FEATURED_DIR) -> None:
        self._templates = [
            StoreTemplate(
                id=store_id,
                owner_id=FEATURED_OWNER,
                template_id=str(doc["id"]),
                author_name=FEATURED_AUTHOR,
                status=TemplateStatus.PUBLISHED,
                document=doc,
                created_at=FEATURED_AT,
                published_at=FEATURED_AT,
                featured=True,
            )
            for store_id, name in (FEATURED_FILES if files is None else files).items()
            for doc in [validated_document(json.loads((directory / name).read_text()))]
        ]

    def all(self) -> list[StoreTemplate]:
        return list(self._templates)
