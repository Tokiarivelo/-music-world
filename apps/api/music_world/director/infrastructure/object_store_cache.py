"""Director cache and spend tracker as small JSON objects in the object store (local disk or S3)."""

import json
from typing import Any, Protocol

KEY_PREFIX = "director"


class _Store(Protocol):
    async def put_bytes(self, key: str, data: bytes, content_type: str) -> None: ...
    async def get_bytes(self, key: str) -> bytes | None: ...


def _audio_key(audio_hash: str) -> str:
    return audio_hash.removeprefix("sha256:")


class ObjectStoreDirectorCache:
    def __init__(self, store: _Store) -> None:
        self._store = store

    async def get(self, key: str) -> dict[str, Any] | None:
        data = await self._store.get_bytes(f"{KEY_PREFIX}/cache/{key}.json")
        if data is None:
            return None
        doc = json.loads(data)
        return doc if isinstance(doc, dict) else None

    async def put(self, key: str, template: dict[str, Any]) -> None:
        await self._store.put_bytes(f"{KEY_PREFIX}/cache/{key}.json", json.dumps(template).encode(), "application/json")


class ObjectStoreSpendTracker:
    """Not atomic across processes: a few cents of overshoot are possible under concurrent calls (estimate only)."""

    def __init__(self, store: _Store) -> None:
        self._store = store

    async def spent(self, audio_hash: str) -> float:
        data = await self._store.get_bytes(f"{KEY_PREFIX}/spend/{_audio_key(audio_hash)}.json")
        if data is None:
            return 0.0
        value = json.loads(data).get("usd", 0.0)
        return float(value) if isinstance(value, int | float) else 0.0

    async def add(self, audio_hash: str, usd: float) -> None:
        total = await self.spent(audio_hash) + max(usd, 0.0)
        body = json.dumps({"usd": round(total, 6)}).encode()
        await self._store.put_bytes(f"{KEY_PREFIX}/spend/{_audio_key(audio_hash)}.json", body, "application/json")
