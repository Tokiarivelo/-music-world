"""Object layout of a chosen template (I41): inventory, deterministic mock layout and validation of model output.

The user picks the template; the director then writes where each object of its inventory grows and in which order
the notes pick them. Model output is untrusted data: it is validated against `WorldLayout`, and only kinds of the
template's own inventory survive."""

import hashlib
import math
from typing import Any

from pydantic import ValidationError

from music_world.schemas.template import WorldLayout

# Theme of the objects that grow on the ground, in the order they appear from the centre of the world outwards.
THEME_ORDER = ("keep", "village", "forest", "crystal", "kelp", "coral", "sand", "wreck")
_THEME_OF: dict[str, str] = {
    "recipe:kelp": "kelp",
    "recipe:seagrass": "kelp",
    "recipe:staghorn_coral": "coral",
    "recipe:brain_coral": "coral",
    "recipe:coral_fan": "coral",
    "recipe:tube_sponge": "coral",
    "recipe:sea_anemone": "coral",
    "recipe:starfish": "sand",
    "recipe:sea_urchin": "sand",
    "recipe:crab": "sand",
    "recipe:seashell": "sand",
    "recipe:shipwreck": "wreck",
    "recipe:castle": "keep",
    "recipe:dragon": "keep",
    "recipe:wizard_tower": "village",
    "recipe:mushroom_house": "village",
    "recipe:giant_mushroom": "forest",
    "recipe:magic_tree": "forest",
    "recipe:glow_flower": "forest",
    "recipe:crystal_cluster": "crystal",
}
_WEIGHT: dict[str, float] = {
    "recipe:shipwreck": 0.0,
    "recipe:castle": 0.0,
    "recipe:dragon": 0.12,
    "recipe:wizard_tower": 0.5,
}
_PATCHES: dict[str, int] = {
    "keep": 1,
    "village": 3,
    "forest": 4,
    "crystal": 3,
    "kelp": 3,
    "coral": 4,
    "sand": 2,
    "wreck": 1,
}
_BUILTIN_ROLE = {
    "building": "building",
    "tree": "flora",
    "conifer": "flora",
    "bush": "flora",
    "car": "vehicle",
    "bicycle": "vehicle",
    "cloud": "sky",
    "airplane": "sky",
    "spike": "landmark",
    "terrain_ridge": "terrain",
}
_GIANTS = {"recipe:whale", "recipe:shark"}
_SWIMMERS = {
    "recipe:dolphin",
    "recipe:manta_ray",
    "recipe:sea_turtle",
    "recipe:jellyfish",
    "recipe:octopus",
    "recipe:seahorse",
    "recipe:clownfish",
    "recipe:fish_school",
    "recipe:pufferfish",
}


def role_of(kind: str) -> str:
    if kind in _BUILTIN_ROLE:
        return _BUILTIN_ROLE[kind]
    if kind in _THEME_OF:
        return "benthic"
    if kind in _GIANTS:
        return "giant"
    if kind == "recipe:bubble_column":
        return "effect"
    return "swimmer" if kind in _SWIMMERS else "other"


def inventory_of(template: dict[str, Any]) -> list[dict[str, str]]:
    """Every kind the template can put in the world (mappings, scenery, recipes), once each, with its role."""
    kinds: dict[str, None] = {}
    for rule in template.get("mappings", []):
        kinds[rule["spawn"]] = None
    for item in template.get("scenery", []):
        kinds[item["kind"]] = None
    for recipe in template.get("recipes", []):
        kinds[f"recipe:{recipe['name']}"] = None
    return [{"kind": k, "role": role_of(k)} for k in kinds]


def mock_layout(template: dict[str, Any], audio_hash: str = "") -> dict[str, Any]:
    """Deterministic layout from the inventory: one patch set per theme, from the centre outwards, centre first."""
    inventory = inventory_of(template)
    grounded = [i["kind"] for i in inventory if i["role"] == "benthic"]
    themes = [t for t in THEME_ORDER if any(_THEME_OF[k] == t for k in grounded)]
    offset = int(hashlib.sha256(audio_hash.encode()).hexdigest()[:6], 16) / 0xFFFFFF * 2 * math.pi
    wanted = [(t, i) for t in themes for i in range(_PATCHES[t])]
    patches: list[dict[str, Any]] = []
    steps: list[dict[str, Any]] = []
    ids: dict[tuple[str, int], str] = {}
    for n, (theme, i) in enumerate(wanted):
        angle = offset + n * 2.399963
        dist = 0.18 + 0.62 * math.sqrt((n + 0.5) / (len(wanted) + 1))
        pid = f"{theme}_{i + 1}"
        ids[(theme, i)] = pid
        patches.append(
            {
                "id": pid,
                "theme": theme,
                "radius": 0.2 if theme == "wreck" else 0.22,
                "x": round(math.cos(angle) * dist, 3),
                "z": round(math.sin(angle) * dist, 3),
            }
        )
    for theme in themes:
        mine = [k for k in grounded if _THEME_OF[k] == theme]
        for i in range(_PATCHES[theme]):
            for kind in mine:
                steps.append({"kind": kind, "patch": ids[(theme, i)], "weight": _WEIGHT.get(kind, 1.0)})
    return {
        "inventory": inventory,
        "patches": patches[:24],
        "sequence": [s for s in steps if s["patch"] in {p["id"] for p in patches[:24]}][:48],
    }


def parse_layout(raw: dict[str, Any], template: dict[str, Any]) -> WorldLayout | None:
    """A model's layout, if valid: the inventory is always the template's own, steps keep known kinds only."""
    inventory = inventory_of(template)
    known = {i["kind"] for i in inventory}
    try:
        layout = WorldLayout.model_validate({**raw, "inventory": inventory})
    except ValidationError:
        return None
    steps = [s for s in layout.sequence if s.kind in known]
    if not steps or not layout.patches:
        return None
    return layout.model_copy(update={"sequence": steps})
