from music_world.director.infrastructure.object_store_cache import ObjectStoreDirectorCache, ObjectStoreSpendTracker
from tests.fakes import InMemoryObjectStore

HASH = "sha256:" + "a" * 64


async def test_cache_round_trip() -> None:
    store = InMemoryObjectStore()
    cache = ObjectStoreDirectorCache(store)
    assert await cache.get("k1") is None
    await cache.put("k1", {"id": "ai-mock-1"})
    assert await cache.get("k1") == {"id": "ai-mock-1"}
    assert "director/cache/k1.json" in store.objects


async def test_spend_accumulates_per_audio() -> None:
    store = InMemoryObjectStore()
    spend = ObjectStoreSpendTracker(store)
    await spend.add(HASH, 0.25)
    await spend.add(HASH, 0.5)
    await spend.add(HASH, -3)
    assert await spend.spent(HASH) == 0.75 and await spend.spent("sha256:" + "b" * 64) == 0
    assert f"director/spend/{'a' * 64}.json" in store.objects
