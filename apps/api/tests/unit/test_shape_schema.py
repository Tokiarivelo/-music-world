"""ShapeRecipe contract: closed ops, bounded numbers, triangle budget, and the template cross-references."""

import json
from pathlib import Path

import pytest
from hypothesis import assume, given
from hypothesis import strategies as st
from pydantic import ValidationError

from music_world.director.domain.renderable import renderability_errors
from music_world.schemas.shape import MAX_TRIANGLES_CAP, Part, ShapeRecipe, primitive_triangles
from music_world.schemas.template import WorldTemplate

FIXTURES = json.loads((Path(__file__).parent.parent / "fixtures" / "shape-recipes.json").read_text())
DEFAULT_TEMPLATE = Path(__file__).parents[2] / "music_world/director/infrastructure/default_template.json"

parts = st.builds(
    Part,
    op=st.sampled_from(["box", "prism", "spike", "stack", "cluster"]),
    of=st.sampled_from(["box", "prism", "spike"]),
    sides=st.integers(3, 12),
    taper=st.floats(0, 1),
    levels=st.integers(2, 8),
    count=st.integers(2, 12),
)


@pytest.mark.parametrize("case", FIXTURES, ids=[c["name"] for c in FIXTURES])
def test_fixture_recipes_have_the_documented_triangle_counts(case: dict) -> None:
    assert ShapeRecipe.model_validate(case["recipe"]).triangle_count() == case["triangles"]


@given(st.lists(parts, min_size=1, max_size=8))
def test_triangle_count_is_the_sum_of_the_parts_and_a_budget_is_enforced(items: list[Part]) -> None:
    total = sum(p.triangle_count() for p in items)
    assume(total <= MAX_TRIANGLES_CAP)
    assert total > 0
    budget = {"maxTriangles": max(total, 12)}
    doc = {"name": "x", "parts": [p.model_dump(by_alias=True) for p in items], "budget": budget}
    assert ShapeRecipe.model_validate(doc).triangle_count() == total
    if total > 12:
        doc["budget"] = {"maxTriangles": total - 1}
        with pytest.raises(ValidationError, match="budget"):
            ShapeRecipe.model_validate(doc)


@given(parts)
def test_a_part_never_exceeds_the_largest_possible_primitive_group(part: Part) -> None:
    assert 0 < part.triangle_count() <= 12 * 4 * 12  # 12 copies of a 12-sided prism


def test_primitive_sizes() -> None:
    assert [primitive_triangles("box", 6, 1), primitive_triangles("spike", 6, 1)] == [12, 4]
    assert primitive_triangles("prism", 6, 1) == 24 and primitive_triangles("prism", 6, 0) == 12


@pytest.mark.parametrize(
    "bad",
    [
        {"name": "x", "parts": []},
        {"name": "Bad Name", "parts": [{"op": "box"}]},
        {"name": "x", "parts": [{"op": "lathe"}]},
        {"name": "x", "parts": [{"op": "box", "width": 5}]},
        {"name": "x", "parts": [{"op": "box", "script": "alert(1)"}]},
        {"name": "x", "parts": [{"op": "box"}], "budget": {"maxTriangles": MAX_TRIANGLES_CAP + 1}},
        {"name": "x", "parts": [{"op": "box"}] * 9},
        {"name": "x", "parts": [{"op": "cluster", "of": "prism", "count": 12, "sides": 12}] * 2},
    ],
)
def test_invalid_recipes_are_rejected(bad: dict) -> None:
    with pytest.raises(ValidationError):
        ShapeRecipe.model_validate(bad)


def _template(**changes: object) -> dict:
    return json.loads(DEFAULT_TEMPLATE.read_text()) | changes


def test_template_carries_recipes_with_unique_names() -> None:
    recipe = FIXTURES[3]["recipe"]
    ok = _template(mappings=[{"when": {}, "spawn": "recipe:tower"}], recipes=[recipe])
    assert WorldTemplate.model_validate(ok).recipes[0].name == "tower"
    with pytest.raises(ValidationError, match="unique"):
        WorldTemplate.model_validate(_template(recipes=[recipe, recipe]))
    with pytest.raises(ValidationError):
        WorldTemplate.model_validate(_template(recipes=[recipe | {"name": f"t{i}"} for i in range(17)]))


def test_renderability_accepts_only_defined_recipe_kinds() -> None:
    recipe = FIXTURES[3]["recipe"]
    defined = WorldTemplate.model_validate(
        _template(mappings=[{"when": {}, "spawn": "recipe:tower"}], recipes=[recipe])
    ).model_dump(by_alias=True, mode="json")
    assert renderability_errors(defined) == []
    ghost = defined | {"mappings": [{"when": {}, "spawn": "recipe:ghost"}]}
    assert any("recipe" in e for e in renderability_errors(ghost))
    zone = defined | {"zones": [{"kind": "recipe:ghost", "xMin": -1, "xMax": 1, "zMin": -1, "zMax": 1}]}
    assert any(e.startswith("zones[0].kind") for e in renderability_errors(zone))


def test_scenery_is_bounded_and_needs_known_kinds() -> None:
    recipe = FIXTURES[3]["recipe"]
    scenery = [{"kind": "building", "count": 5}, {"kind": "recipe:tower", "count": 3}]
    ok = _template(recipes=[recipe], scenery=scenery)
    assert [s.count for s in WorldTemplate.model_validate(ok).scenery] == [5, 3]
    assert renderability_errors(ok) == []
    assert renderability_errors(_template(scenery=[{"kind": "recipe:nope", "count": 1}]))
    with pytest.raises(ValidationError):
        WorldTemplate.model_validate(_template(scenery=[{"kind": "building", "count": 0}]))
    with pytest.raises(ValidationError, match="at most"):
        WorldTemplate.model_validate(_template(scenery=[{"kind": "building", "count": 60}] * 8))


def test_a_generated_template_keeps_at_most_four_recipes() -> None:
    recipe = FIXTURES[3]["recipe"]
    five = _template(recipes=[recipe | {"name": f"t{i}"} for i in range(5)])
    assert WorldTemplate.model_validate(five)  # the store accepts up to 16
    assert any("at most 4" in e for e in renderability_errors(five))
