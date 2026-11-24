"""Renderability specification of a director template (requirement 3.3), on the plain JSON document.

The pydantic contract already checks types, enums, ranges and zone order. These rules add what the engine and the
default look need from a generated template.
"""

import json
from collections.abc import Mapping
from typing import Any

BUILTIN_KINDS = frozenset({"terrain_ridge", "building", "spike", "crystal", "cluster"})
MAX_TEMPLATE_BYTES = 32 * 1024
MIN_STAFF_CONTRAST = 0.2


def _channel(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_color: str) -> float:
    """WCAG relative luminance of `#rrggbb` (0 = black, 1 = white)."""
    r, g, b = (int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def renderability_errors(doc: Mapping[str, Any]) -> list[str]:
    """Empty when the (already schema-valid) document can be rendered as a director template."""
    errors: list[str] = []
    for i, rule in enumerate(doc.get("mappings", [])):
        if rule.get("spawn") not in BUILTIN_KINDS:
            errors.append(f"mappings[{i}].spawn: recipe kinds need a ShapeRecipe; use a built-in kind")
    for i, zone in enumerate(doc.get("zones", [])):
        if zone.get("kind") not in BUILTIN_KINDS:
            errors.append(f"zones[{i}].kind: use a built-in kind")
    palette = doc.get("palette", {})
    if "staff" in palette and "background" in palette:
        contrast = abs(relative_luminance(palette["staff"]) - relative_luminance(palette["background"]))
        if contrast < MIN_STAFF_CONTRAST:
            errors.append("palette.staff: must stand out from palette.background (luminance difference >= 0.2)")
    if len(json.dumps(doc, separators=(",", ":"))) > MAX_TEMPLATE_BYTES:
        errors.append("template: larger than 32 KB")
    return errors
