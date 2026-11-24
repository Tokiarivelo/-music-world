"""The northern-lights launch template "Aurora Night": the staff is an aurora in the sky and notes fall as rain."""

from music_world.schemas.template import WorldTemplate
from music_world.templates.domain.specification import relative_luminance, store_errors
from music_world.templates.infrastructure.featured_catalog import AURORA_STORE_ID, FileFeaturedCatalog


def test_aurora_night_is_featured_valid_and_uses_the_aurora_staff() -> None:
    [item] = [t for t in FileFeaturedCatalog().all() if t.id == AURORA_STORE_ID]
    template = WorldTemplate.model_validate(item.document)
    assert item.featured and template.id == "aurora-night" and store_errors(item.document) == []
    assert template.staff.style == "aurora"
    # a long fall: the drop is visible from the curtain down to the plate
    assert template.staff.fall_duration >= 1.0 and template.staff.lookahead >= 4
    assert relative_luminance(template.palette.background) < 0.01
    assert template.mappings[-1].when.model_dump(exclude_none=True) == {}
