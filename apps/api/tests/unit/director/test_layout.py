"""Object layout of a chosen template (I41): inventory, mock layout, validation of model output."""

import json
from pathlib import Path
from typing import Any

from music_world.director.application.layout import inventory_of, mock_layout, parse_layout, role_of
from music_world.schemas.template import WorldLayout

FEATURED = Path(__file__).parents[3] / "music_world/templates/infrastructure/featured"


def _realm() -> dict[str, Any]:
    return json.loads((FEATURED / "enchanted-realm.json").read_text())


def test_inventory_lists_every_kind_once_with_its_role() -> None:
    inv = inventory_of(_realm())
    kinds = [i["kind"] for i in inv]
    assert len(kinds) == len(set(kinds))
    assert {"kind": "recipe:castle", "role": "benthic"} in inv
    assert role_of("building") == "building" and role_of("recipe:whale") == "giant"


def test_mock_layout_is_valid_deterministic_and_puts_the_keep_first() -> None:
    template = _realm()
    layout = mock_layout(template, "sha256:abc")
    assert layout == mock_layout(template, "sha256:abc")
    parsed = WorldLayout.model_validate(layout)
    assert parsed.patches[0].theme == "keep"
    assert {s.kind for s in parsed.sequence} >= {"recipe:magic_tree", "recipe:crystal_cluster"}
    assert next(s for s in parsed.sequence if s.kind == "recipe:castle").weight == 0


def test_parse_layout_keeps_only_kinds_of_the_template_and_rejects_nonsense() -> None:
    template = _realm()
    raw = {
        "patches": [{"id": "a", "theme": "forest", "x": 0.2, "z": -0.3, "radius": 0.3}],
        "sequence": [
            {"kind": "recipe:magic_tree", "patch": "a", "weight": 2},
            {"kind": "recipe:kraken", "patch": "a", "weight": 2},
        ],
    }
    layout = parse_layout(raw, template)
    assert layout is not None and [s.kind for s in layout.sequence] == ["recipe:magic_tree"]
    assert parse_layout({"patches": [], "sequence": []}, template) is None
    assert parse_layout({**raw, "sequence": [{"kind": "recipe:magic_tree", "patch": "zz"}]}, template) is None
