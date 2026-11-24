"""Model text → JSON object. Strips one optional Markdown code fence; anything else is `INVALID_JSON`."""

import json
import re
from typing import Any

from music_world.director.domain.errors import ProviderError

_FENCE = re.compile(r"^\s*```(?:json)?\s*\n(.*?)\n?```\s*$", re.DOTALL)


def parse_json_object(text: str | None) -> dict[str, Any]:
    if not text:
        raise ProviderError("INVALID_JSON", "empty reply")
    m = _FENCE.match(text)
    body = m.group(1) if m else text
    try:
        value = json.loads(body)
    except (json.JSONDecodeError, RecursionError) as exc:
        raise ProviderError("INVALID_JSON", "reply is not JSON") from exc
    if not isinstance(value, dict):
        raise ProviderError("INVALID_JSON", "reply is not a JSON object")
    return value
