"""Model output → template (requirement 3.1): sanitize and clamp against the JSON Schema, validate, check rendering.

Model output is untrusted data. It is never executed or interpolated into code, SQL, shell or HTML (requirement 3.4).
"""

import math
from functools import cache
from typing import Any

from pydantic import ValidationError

from music_world.director.domain.renderable import renderability_errors
from music_world.schemas.template import WorldTemplate

MAX_ERRORS = 20
DEFAULT_NAME = "AI world"


@cache
def template_json_schema() -> dict[str, Any]:
    return WorldTemplate.model_json_schema(by_alias=True)


def _resolve(node: dict[str, Any], defs: dict[str, Any]) -> dict[str, Any]:
    while "$ref" in node:
        node = defs[node["$ref"].rsplit("/", 1)[-1]]
    return node


_DROP = object()


def _is_number(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def _matches_type(value: object, node: dict[str, Any]) -> bool:
    kind = node.get("type")
    if "$ref" in node or kind == "object":
        return isinstance(value, dict)
    if kind == "array":
        return isinstance(value, list)
    if kind == "string" or "const" in node or "enum" in node:
        return isinstance(value, str)
    if kind in ("number", "integer"):
        return _is_number(value)
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "null":
        return value is None
    return True


def _clean(value: Any, node: dict[str, Any], defs: dict[str, Any]) -> Any:
    node = _resolve(node, defs)
    if "anyOf" in node:
        branches = [_resolve(b, defs) for b in node["anyOf"]]
        for branch in branches:
            if _matches_type(value, branch):
                return _clean(value, branch, defs)
        return value  # let pydantic report it
    kind = node.get("type")
    if kind == "object" and isinstance(value, dict):
        props: dict[str, Any] = node.get("properties", {})
        out: dict[str, Any] = {}
        for key, sub in props.items():
            if key in value:
                cleaned = _clean(value[key], sub, defs)
                if cleaned is not _DROP:
                    out[key] = cleaned
        return out
    if kind == "array" and isinstance(value, list):
        items = value[: node.get("maxItems", len(value))]
        sub = node.get("items", {})
        return [c for c in (_clean(v, sub, defs) for v in items) if c is not _DROP]
    if kind in ("number", "integer") and _is_number(value):
        number = float(value)
        if not math.isfinite(number):
            return _DROP
        if "minimum" in node:
            number = max(number, float(node["minimum"]))
        if "maximum" in node:
            number = min(number, float(node["maximum"]))
        return int(round(number)) if kind == "integer" else number
    if kind == "string" and isinstance(value, str) and "maxLength" in node:
        return value[: node["maxLength"]]
    return value


def sanitize(raw: Any) -> Any:
    """Drops unknown keys, clamps numbers to schema bounds, cuts strings and arrays to their maximum size."""
    schema = template_json_schema()
    return _clean(raw, schema, schema.get("$defs", {}))


def _format(error: Any) -> str:
    loc = ".".join(str(p) for p in error["loc"]) or "template"
    return f"{loc}: {error['msg']}"


def parse_template(
    raw: Any, *, template_id: str, generated_by: dict[str, str]
) -> tuple[dict[str, Any] | None, list[str]]:
    """Returns `(document, [])` for a renderable template, else `(None, errors)` (≤ 20 errors, no model text)."""
    if not isinstance(raw, dict):
        return None, ["template: expected a JSON object"]
    doc = sanitize(raw)
    name = doc.get("name")
    doc |= {
        "schema": "music-world.template.v1",
        "id": template_id,
        "license": "CC-BY-4.0",
        "name": name.strip()[:60] if isinstance(name, str) and name.strip() else DEFAULT_NAME,
        "meta": {"generatedBy": generated_by},
    }
    try:
        template = WorldTemplate.model_validate(doc)
    except ValidationError as exc:
        return None, [_format(e) for e in exc.errors()[:MAX_ERRORS]]
    out = template.model_dump(by_alias=True, mode="json")
    errors = renderability_errors(out)
    return (None, errors[:MAX_ERRORS]) if errors else (out, [])
