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
