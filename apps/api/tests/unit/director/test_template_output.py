"""Requirement 3.3: for any model output, the result is either rejected or a template the engine can render."""

import copy
import json
import math
import re
from typing import Any

from hypothesis import HealthCheck, event, example, given, settings
from hypothesis import strategies as st

from music_world.director.application.template_output import parse_template, sanitize
from music_world.schemas.template import WorldTemplate
from tests.unit.director.helpers import valid_llm_template

GEN = {"provider": "mock", "model": "mock-director-1", "promptVersion": "director-v1"}
# Same expression as `parseRange` in apps/web/src/engine/mapping.ts.
ENGINE_RANGE = re.compile(r"^(?:([<>])(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?))$")
BUILTIN = {"terrain_ridge", "building", "spike", "crystal", "cluster"}
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

json_scalars = st.none() | st.booleans() | st.integers() | st.floats() | st.text(max_size=20)
any_json = st.recursive(
    json_scalars, lambda inner: st.lists(inner, max_size=5) | st.dictionaries(st.text(max_size=10), inner, max_size=5)
)
numbers = st.integers(-10_000, 10_000) | st.floats(allow_nan=True, allow_infinity=True)


def mostly(valid: st.SearchStrategy[Any], invalid: st.SearchStrategy[Any]) -> st.SearchStrategy[Any]:
    """Valid 7 times out of 8, so that both outcomes (rejected / renderable) are exercised."""
    return st.integers(0, 7).flatmap(lambda i: invalid if i == 7 else valid)  # Hypothesis favours 0: valid


builtin = st.sampled_from(sorted(BUILTIN))
kinds = mostly(builtin, st.from_regex(r"recipe:[a-z]{1,8}", fullmatch=True) | st.text(max_size=12))
pitch = st.integers(0, 127).map(lambda a: f"<{a}") | st.integers(0, 127).map(lambda a: f">{a}")
ranges = mostly(pitch, st.from_regex(r"(<\d{1,3}|\d{1,3}-\d{1,3})", fullmatch=True) | st.text(max_size=8))
colors = mostly(st.from_regex(r"#[0-9a-f]{6}", fullmatch=True), st.text(max_size=8))
unit = st.floats(-1, 1)


@st.composite
def zone(draw: st.DrawFn) -> dict[str, Any]:
    x, z = sorted(draw(st.lists(unit, min_size=2, max_size=2))), sorted(draw(st.lists(unit, min_size=2, max_size=2)))
    doc = {"kind": draw(kinds), "xMin": x[0], "xMax": x[1], "zMin": z[0], "zMax": z[1]}
    if draw(st.integers(0, 7)) == 7:
        doc[draw(st.sampled_from(["xMin", "xMax", "zMin", "zMax"]))] = draw(numbers)
    return doc


@st.composite
def template_shaped(draw: st.DrawFn) -> dict[str, Any]:
    """Near-valid documents: a valid template with fields replaced by out-of-range or wrong values."""
    doc = copy.deepcopy(valid_llm_template())
    doc["palette"] = {k: draw(colors) for k in doc["palette"]}
    doc["palette"]["background"], doc["palette"]["staff"] = draw(
        mostly(st.just(("#000000", "#ffffff")), st.tuples(colors, colors))
    )
    doc["terrain"] = {
        "size": draw(numbers),
        "style": draw(mostly(st.just("cracked_plate"), st.sampled_from(["lava", 3]))),
    }
    doc["staff"] = {"glow": draw(numbers), "lookahead": draw(numbers), "fallDuration": draw(numbers)}
    rule = st.fixed_dictionaries(
        {"when": st.fixed_dictionaries({}, optional={"pitch": ranges, "chord": st.booleans()}), "spawn": kinds},
        optional={"heightFrom": mostly(st.just("pitch"), st.just("loudness")), "evil": any_json},
    )
    doc["mappings"] = draw(mostly(st.lists(rule, min_size=1, max_size=6), st.lists(rule, max_size=1)))
    doc["zones"] = draw(st.lists(zone(), max_size=4))
    doc["budget"] = {"instancesPerKind": draw(numbers)}
    doc["fx"] = {"bloom": draw(numbers), "beatPulse": draw(mostly(st.booleans(), any_json))}
    if draw(st.booleans()):
        doc[draw(st.text(max_size=8))] = draw(any_json)
    if draw(st.booleans()):
        doc["meta"] = {"generatedBy": {"provider": "muse", "model": "forged", "promptVersion": "x"}}
    return doc


def assert_renderable(doc: dict[str, Any], template_id: str) -> None:
    """Oracle independent from the code under test: what the web engine and the default look need."""
    WorldTemplate.model_validate(doc)
    assert doc["id"] == template_id and doc["meta"] == {"generatedBy": GEN} and doc["license"] == "CC-BY-4.0"
    assert all(HEX.match(c) for c in doc["palette"].values())
    assert abs(_luminance(doc["palette"]["staff"]) - _luminance(doc["palette"]["background"])) >= 0.2
    assert 1 <= len(doc["mappings"]) <= 32
    for rule in doc["mappings"]:
        assert rule["spawn"] in BUILTIN
        for field in ("pitch", "velocity"):
            if rule["when"].get(field) is not None:
                assert ENGINE_RANGE.match(rule["when"][field])
    for zone in doc["zones"]:
        assert zone["kind"] in BUILTIN and zone["xMin"] < zone["xMax"] and zone["zMin"] < zone["zMax"]
    text = json.dumps(doc, allow_nan=False)  # raises on NaN / inf
    assert len(text) <= 32 * 1024
    assert all(math.isfinite(v) for v in _numbers(doc))


def _luminance(color: str) -> float:
    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (lin(int(color[i : i + 2], 16) / 255) for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _numbers(value: Any) -> list[float]:
    if isinstance(value, dict):
        return [n for v in value.values() for n in _numbers(v)]
    if isinstance(value, list):
        return [n for v in value for n in _numbers(v)]
    return [float(value)] if isinstance(value, int | float) and not isinstance(value, bool) else []


def _check(raw: Any) -> bool:
    doc, errors = parse_template(raw, template_id="ai-mock-0123abcd", generated_by=GEN)
    if doc is None:
        assert errors and all(isinstance(e, str) for e in errors) and len(errors) <= 20
        return False
    assert errors == []
    assert_renderable(doc, "ai-mock-0123abcd")
    again, _ = parse_template(doc, template_id="ai-mock-0123abcd", generated_by=GEN)
    assert again == doc  # fixed point
    return True


@settings(max_examples=300, suppress_health_check=[HealthCheck.too_slow])
@given(any_json)
def test_arbitrary_json_is_rejected_or_renderable(raw: Any) -> None:
    _check(raw)


@settings(max_examples=400, suppress_health_check=[HealthCheck.too_slow])
@given(template_shaped())
def test_near_valid_templates_are_rejected_or_renderable(raw: dict[str, Any]) -> None:
    event("renderable" if _check(raw) else "rejected")


@example(math.nan, math.inf, -math.inf)
@given(numbers, numbers, numbers)
def test_out_of_range_numbers_are_clamped_not_rejected(size: float, glow: float, bloom: float) -> None:
    raw = valid_llm_template() | {"terrain": {"size": size}, "staff": {"glow": glow}, "fx": {"bloom": bloom}}
    assert _check(raw), "a valid template with any finite or non-finite numbers must survive clamping"


def test_valid_output_is_accepted_and_stamped() -> None:
    doc, errors = parse_template(valid_llm_template(), template_id="ai-mock-0123abcd", generated_by=GEN)
    assert errors == [] and doc is not None
    assert doc["name"] == "Midnight Glass" and doc["fx"]["particles"] == "dust"


def test_forged_identity_fields_are_overwritten() -> None:
    raw = valid_llm_template() | {"id": "neon-nocturne", "license": "MIT", "schema": "x", "meta": {"generatedBy": 1}}
    doc, _ = parse_template(raw, template_id="ai-muse-00000000", generated_by=GEN)
    assert doc is not None and doc["id"] == "ai-muse-00000000" and doc["license"] == "CC-BY-4.0"


def test_unknown_keys_and_code_are_dropped() -> None:
    raw = valid_llm_template() | {"script": "alert(1)", "onLoad": "fetch('https://evil')"}
    raw["mappings"][0]["code"] = "rm -rf /"
    clean = sanitize(raw)
    assert "script" not in clean and "code" not in clean["mappings"][0]


def test_recipe_kinds_and_invalid_zones_are_rejected_with_errors() -> None:
    raw = valid_llm_template() | {"mappings": [{"when": {}, "spawn": "recipe:tower"}]}
    doc, errors = parse_template(raw, template_id="ai-mock-0123abcd", generated_by=GEN)
    assert doc is None and any("recipe" in e for e in errors)
    raw = valid_llm_template() | {"zones": [{"kind": "building", "xMin": 0.5, "xMax": 0.1, "zMin": 0, "zMax": 1}]}
    assert parse_template(raw, template_id="ai-mock-0123abcd", generated_by=GEN)[0] is None


def test_missing_name_gets_a_default() -> None:
    raw = {k: v for k, v in valid_llm_template().items() if k != "name"}
    doc, _ = parse_template(raw, template_id="ai-mock-0123abcd", generated_by=GEN)
    assert doc is not None and doc["name"] == "AI world"


def test_lists_are_cut_to_the_schema_maximum() -> None:
    raw = valid_llm_template() | {"mappings": [{"when": {}, "spawn": "building"}] * 50}
    doc, _ = parse_template(raw, template_id="ai-mock-0123abcd", generated_by=GEN)
    assert doc is not None and len(doc["mappings"]) == 32


def test_a_director_template_may_define_and_use_recipes() -> None:
    recipe = {"name": "tower", "parts": [{"op": "stack", "of": "box", "levels": 3}], "budget": {"maxTriangles": 100}}
    raw = valid_llm_template() | {
        "mappings": [{"when": {}, "spawn": "recipe:tower"}],
        "recipes": [recipe | {"junk": "dropped"}],
    }
    doc, errors = parse_template(raw, template_id="ai-mock-0123abcd", generated_by=GEN)
    assert errors == [] and doc is not None
    assert doc["recipes"][0]["name"] == "tower" and "junk" not in doc["recipes"][0]
    over = recipe | {"budget": {"maxTriangles": 12}}
    assert parse_template(raw | {"recipes": [over]}, template_id="ai-mock-0123abcd", generated_by=GEN)[0] is None
