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
        WorldTemplate.model_validate(_template(recipes=[recipe | {"name": f"t{i}"} for i in range(29)]))


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


def test_recipe_scale_has_defaults_and_bounds() -> None:
    recipe = FIXTURES[3]["recipe"]
    plain = ShapeRecipe.model_validate(recipe)
    assert (plain.footprint, plain.height_scale) == (0.25, 1)
    squat = ShapeRecipe.model_validate(recipe | {"footprint": 1.2, "heightScale": 0.3})
    assert (squat.footprint, squat.height_scale) == (1.2, 0.3)
    for bad in ({"footprint": 0.05}, {"footprint": 2}, {"heightScale": 0}, {"heightScale": 3}):
        with pytest.raises(ValidationError):
            ShapeRecipe.model_validate(recipe | bad)


def _node(id_: str, parent: str | None = None, **extra: object) -> dict:
    return {"id": id_, "name": id_.title(), "parent": parent, **extra}


def test_node_triangles_by_primitive_and_hidden() -> None:
    from music_world.schemas.shape import node_primitive_triangles

    sizes = {p: node_primitive_triangles(p, 8, 1) for p in ("box", "cylinder", "cone", "sphere", "prism", "gable")}
    assert sizes == {"box": 12, "cylinder": 32, "cone": 16, "sphere": 80, "prism": 32, "gable": 8}
    assert node_primitive_triangles("prism", 8, 0) == 16
    recipe = ShapeRecipe.model_validate(
        {"name": "hut", "nodes": [_node("walls"), _node("roof", "walls", primitive="gable", hidden=True)]}
    )
    assert recipe.triangle_count() == 12


@pytest.mark.parametrize(
    ("nodes", "message"),
    [
        ([_node("a"), _node("a")], "duplicate"),
        ([_node("b", "a"), _node("a")], "earlier"),
        ([_node("a"), _node("b", "a"), _node("c", "b"), _node("d", "c"), _node("e", "d")], "deeper"),
    ],
)
def test_node_tree_rules(nodes: list[dict], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        ShapeRecipe.model_validate({"name": "x", "nodes": nodes})


def test_a_recipe_needs_parts_or_nodes() -> None:
    with pytest.raises(ValidationError, match="at least one"):
        ShapeRecipe.model_validate({"name": "x"})


def _recipe(*nodes: dict) -> ShapeRecipe:
    return ShapeRecipe.model_validate({"name": "t", "nodes": list(nodes), "budget": {"max_triangles": 2000}})


SQUARE = [{"x": -0.5, "z": -0.5}, {"x": 0.5, "z": -0.5}, {"x": 0.5, "z": 0.5}, {"x": -0.5, "z": 0.5}]


def test_extrude_and_bevel_triangle_counts() -> None:
    assert _recipe({"id": "a", "name": "A", "primitive": "box", "bevel": 0.1}).triangle_count() == 44
    assert _recipe({"id": "a", "name": "A", "primitive": "box"}).triangle_count() == 12
    assert _recipe({"id": "a", "name": "A", "primitive": "extrude", "profile": SQUARE}).triangle_count() == 12
    hexagon = [
        {"x": 0.5, "z": 0},
        {"x": 0.25, "z": 0.4},
        {"x": -0.25, "z": 0.4},
        {"x": -0.5, "z": 0},
        {"x": -0.25, "z": -0.4},
        {"x": 0.25, "z": -0.4},
    ]
    assert _recipe({"id": "a", "name": "A", "primitive": "extrude", "profile": hexagon}).triangle_count() == 20


@pytest.mark.parametrize(
    "profile",
    [
        [],
        SQUARE[:2],
        [{"x": -0.5, "z": -0.5}, {"x": 0, "z": 0}, {"x": 0.5, "z": -0.5}, {"x": 0, "z": 0.5}],  # not convex
        [{"x": 0, "z": 0}, {"x": 0.2, "z": 0}, {"x": 0.4, "z": 0}],  # flat
    ],
)
def test_extrude_profile_must_be_a_convex_outline(profile: list[dict]) -> None:
    with pytest.raises(ValidationError):
        _recipe({"id": "a", "name": "A", "primitive": "extrude", "profile": profile})


def test_boolean_nodes_need_an_uncombined_parent() -> None:
    base = {"id": "wall", "name": "Wall"}
    cut = {"id": "door", "name": "Door", "parent": "wall", "operation": "subtract"}
    ok = _recipe(base, cut)
    assert ok.triangle_count() == 12 + 12 + 48
    with pytest.raises(ValidationError):
        _recipe({"id": "door", "name": "Door", "operation": "subtract"})
    with pytest.raises(ValidationError):
        _recipe(base, cut, {"id": "knob", "name": "Knob", "parent": "door", "operation": "union"})
