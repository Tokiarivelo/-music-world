"""Store specification of a template (requirement 3.1), on the schema-valid JSON document.

The pydantic contract already checks types, closed enums, numeric ranges, `#rrggbb` colors and zone order. These rules
add what a public store needs: bounded size, renderable shape kinds, a readable staff and plain text only.
"""

import json
import re
from collections.abc import Mapping
from typing import Any

MAX_TEMPLATE_BYTES = 32 * 1024
BUILTIN_KINDS = frozenset({"terrain_ridge", "building", "spike", "crystal", "cluster"})
MIN_STAFF_CONTRAST = 0.2
_KIND_HINT = "use a built-in shape kind or a recipe defined in `recipes`"
_FORBIDDEN_TEXT = re.compile(r"(://|www\.|data:|javascript:|[<>\x00-\x1f\x7f])", re.IGNORECASE)


def _channel(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_color: str) -> float:
    r, g, b = (int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def store_errors(doc: Mapping[str, Any]) -> list[dict[str, object]]:
    """Empty when the template can be stored; otherwise `[{loc, msg}]` like request validation errors."""
    errors: list[dict[str, object]] = []
    if len(json.dumps(doc, separators=(",", ":"))) > MAX_TEMPLATE_BYTES:
        errors.append({"loc": ["template"], "msg": "template is larger than 32 KB"})
    known = BUILTIN_KINDS | {f"recipe:{r.get('name')}" for r in doc.get("recipes", [])}
    for i, rule in enumerate(doc.get("mappings", [])):
        if rule.get("spawn") not in known:
            errors.append({"loc": ["template", "mappings", i, "spawn"], "msg": _KIND_HINT})
    for i, zone in enumerate(doc.get("zones", [])):
        if zone.get("kind") not in known:
            errors.append({"loc": ["template", "zones", i, "kind"], "msg": _KIND_HINT})
    for i, item in enumerate(doc.get("scenery", [])):
        if item.get("kind") not in known:
            errors.append({"loc": ["template", "scenery", i, "kind"], "msg": _KIND_HINT})
    palette = doc.get("palette", {})
    if "staff" in palette and "background" in palette:
        contrast = abs(relative_luminance(palette["staff"]) - relative_luminance(palette["background"]))
        if contrast < MIN_STAFF_CONTRAST:
            errors.append(
                {"loc": ["template", "palette", "staff"], "msg": "the staff must stand out from the background"}
            )
    name = doc.get("name", "")
    if not isinstance(name, str) or not name.strip() or _FORBIDDEN_TEXT.search(name):
        errors.append({"loc": ["template", "name"], "msg": "plain text only: no links, markup or control characters"})
    return errors
