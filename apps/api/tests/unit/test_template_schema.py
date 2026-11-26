from typing import Any

import pytest
from hypothesis import given
from hypothesis import strategies as st
from pydantic import ValidationError

from music_world.schemas.template import WorldTemplate

PALETTE = {
    "background": "#07051a",
    "terrain": "#1a1533",
    "primary": "#b04cff",
    "accent": "#ff4fd8",
    "secondary": "#22d3ee",
    "staff": "#e8f7ff",
}


def minimal(**overrides: Any) -> dict[str, Any]:
    return {
        "schema": "music-world.template.v1",
        "id": "test-template",
        "name": "Test",
        "license": "MIT",
        "palette": PALETTE,
        "mappings": [{"when": {}, "spawn": "building"}],
        **overrides,
    }


def test_minimal_template_gets_defaults() -> None:
    tpl = WorldTemplate.model_validate(minimal())
    assert tpl.staff.lookahead == 4.0 and tpl.staff.fall_duration == 0.35
    assert tpl.budget.instances_per_kind == 2000
    assert tpl.model_dump(by_alias=True)["schema"] == "music-world.template.v1"


@pytest.mark.parametrize(
    "overrides",
    [
        {"extra": 1},
        {"id": "Not Kebab"},
        {"palette": {**PALETTE, "primary": "red"}},
        {"mappings": []},
        {"mappings": [{"when": {"pitch": "=48"}, "spawn": "building"}]},
        {"mappings": [{"when": {"velocity": ">1.5"}, "spawn": "building"}]},
        {"mappings": [{"when": {}, "spawn": "https://evil.example/model.glb"}]},
        {"mappings": [{"when": {}, "spawn": "building", "code": "alert(1)"}]},
        {"zones": [{"kind": "building", "xMin": 0.5, "xMax": 0.1, "zMin": 0, "zMax": 1}]},
        {"zones": [{"kind": "building", "xMin": -2, "xMax": 0.1, "zMin": 0, "zMax": 1}]},
        {"budget": {"instancesPerKind": 5000}},
    ],
)
def test_invalid_templates_are_rejected(overrides: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        WorldTemplate.model_validate(minimal(**overrides))


@given(st.dictionaries(st.sampled_from(["pitch", "velocity", "stem", "chord"]), st.text(max_size=8)))
def test_mapping_conditions_never_accept_arbitrary_text(when: dict[str, str]) -> None:
    """Free text only passes when it is a well-formed range or enum value (data only, no injection)."""
    try:
        tpl = WorldTemplate.model_validate(minimal(mappings=[{"when": when, "spawn": "spike"}]))
    except ValidationError:
        return
    cond = tpl.mappings[0].when
    assert cond.stem in (None, "vocals", "drums", "bass", "other")
    for text in (cond.pitch, cond.velocity):
        assert text is None or text[0] in "<>0123456789"


def test_default_template_validates_in_python() -> None:
    """The web default template must pass the server-side validation too (same contract on both sides)."""
    import json
    from pathlib import Path

    path = Path(__file__).resolve().parents[3] / "web/src/templates/default/neon-nocturne.json"
    tpl = WorldTemplate.model_validate(json.loads(path.read_text()))
    assert tpl.id == "neon-nocturne"


def _placed(**o: Any) -> dict[str, Any]:
    return {"id": "p1", "kind": "tree", "x": 1.5, "z": -2, **o}


def test_a_map_layout_with_placed_objects_validates() -> None:
    placed = [_placed(), _placed(id="p2", kind="building", yaw=90, scale=2)]
    t = WorldTemplate.model_validate(minimal(layout={"placed": placed, "seed": 7}))
    assert t.layout is not None and len(t.layout.placed) == 2 and t.layout.seed == 7


@pytest.mark.parametrize(
    "layout",
    [
        {"placed": [_placed(), _placed()]},  # duplicate ids
        {"placed": [_placed(x=65)]},
        {"placed": [_placed(scale=0.01)]},
        {"placed": [_placed(yaw=181)]},
        {"placed": [_placed(color="red")]},
        {"placed": [_placed(kind="recipe:missing")]},
        {"placed": [_placed(id=f"p{i}") for i in range(401)]},
        {"seed": -1},
    ],
)
def test_invalid_map_layouts_are_rejected(layout: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        WorldTemplate.model_validate(minimal(layout=layout))
