"""The default template `neon-nocturne`, the last fallback of the director (a copy of the web default, kept equal
by `tests/unit/director/test_default_template.py`)."""

import json
from functools import cache
from pathlib import Path
from typing import Any

from music_world.schemas.template import WorldTemplate

_PATH = Path(__file__).with_name("default_template.json")


@cache
def default_template() -> dict[str, Any]:
    return WorldTemplate.model_validate(json.loads(_PATH.read_text())).model_dump(by_alias=True, mode="json")
