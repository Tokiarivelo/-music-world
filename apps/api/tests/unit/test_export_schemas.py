import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from export_schemas import export, file_name  # noqa: E402

from music_world.schemas import EXPORTED  # noqa: E402


def test_every_schema_id_is_versioned() -> None:
    for schema_id in EXPORTED:
        name, _, version = schema_id.removeprefix("music-world.").rpartition(".v")
        assert schema_id.startswith("music-world.") and name and version.isdigit(), schema_id


def test_export_writes_one_generated_file_per_model(tmp_path: Path) -> None:
    (tmp_path / "stale.v1.schema.json").write_text("{}")
    written = export(tmp_path)
    assert sorted(p.name for p in tmp_path.iterdir()) == sorted(p.name for p in written)
    assert len(written) == len(EXPORTED)
    doc = json.loads((tmp_path / "health.v1.schema.json").read_text())
    assert doc["$id"] == "music-world.health.v1"
    assert doc["$comment"].startswith("GENERATED — do not edit")
    assert doc["additionalProperties"] is False


def test_unprefixed_id_is_rejected() -> None:
    with pytest.raises(ValueError):
        file_name("health.v1")
