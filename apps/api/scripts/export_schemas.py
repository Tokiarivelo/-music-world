"""Export the registered pydantic models to JSON Schema files.

Usage: uv run python scripts/export_schemas.py <out_dir>
Writes `<out_dir>/<name>.v<N>.schema.json` for each id `music-world.<name>.v<N>`.
"""

import json
import sys
from pathlib import Path

from pydantic import BaseModel

from music_world.schemas import EXPORTED

PREFIX = "music-world."


def schema_document(schema_id: str, model: type[BaseModel]) -> dict[str, object]:
    schema = model.model_json_schema()
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": schema_id,
        "$comment": "GENERATED — do not edit. Source: apps/api/music_world/schemas (run `make schemas`).",
        **schema,
    }


def file_name(schema_id: str) -> str:
    if not schema_id.startswith(PREFIX):
        raise ValueError(f"schema id must start with {PREFIX!r}: {schema_id}")
    return f"{schema_id.removeprefix(PREFIX)}.schema.json"


def export(out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("*.schema.json"):
        stale.unlink()
    written = []
    for schema_id, model in sorted(EXPORTED.items()):
        path = out_dir / file_name(schema_id)
        path.write_text(json.dumps(schema_document(schema_id, model), indent=2, ensure_ascii=False) + "\n")
        written.append(path)
    return written


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: export_schemas.py <out_dir>")
    for p in export(Path(sys.argv[1])):
        print(f"[schemas] wrote {p}")
