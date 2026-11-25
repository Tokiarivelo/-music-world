"""The "Living City" launch template: object kinds (I8) mapped to stems, valid for the store."""

from music_world.schemas.template import WorldTemplate
from music_world.templates.domain.specification import store_errors
from music_world.templates.infrastructure.featured_catalog import LIVING_CITY_STORE_ID, FileFeaturedCatalog


def test_living_city_is_featured_valid_and_uses_object_kinds() -> None:
    [item] = [t for t in FileFeaturedCatalog().all() if t.id == LIVING_CITY_STORE_ID]
    template = WorldTemplate.model_validate(item.document)
    assert item.featured and template.id == "living-city" and store_errors(item.document) == []
    spawns = {m.spawn for m in template.mappings}
    assert {"car", "tree", "cloud", "airplane"} <= spawns
    assert template.mappings[-1].when.model_dump(exclude_none=True) == {}
