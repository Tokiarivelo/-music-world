"""The ocean-current launch template "Abyssal Currents" (notes ride sea currents, harmonized palette)."""

from music_world.schemas.template import WorldTemplate
from music_world.templates.domain.specification import BUILTIN_KINDS, relative_luminance, store_errors
from music_world.templates.infrastructure.featured_catalog import ABYSSAL_STORE_ID, FileFeaturedCatalog


def test_abyssal_currents_is_featured_valid_and_carried_by_currents() -> None:
    [item] = [t for t in FileFeaturedCatalog().all() if t.id == ABYSSAL_STORE_ID]
    template = WorldTemplate.model_validate(item.document)
    assert item.featured and store_errors(item.document) == []
    assert template.staff.style == "current" and template.fx.environment == "underwater"
    assert relative_luminance(template.palette.background) < 0.01
    recipe_kinds = {f"recipe:{r.name}" for r in template.recipes}
    assert {rule.spawn for rule in template.mappings} <= BUILTIN_KINDS | recipe_kinds
    assert template.mappings[-1].when.model_dump(exclude_none=True) == {}
