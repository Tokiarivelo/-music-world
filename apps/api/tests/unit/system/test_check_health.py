import asyncio

from music_world.system.application.ports import CheckStatus
from music_world.system.application.use_cases import check_health
from music_world.system.application.use_cases.check_health import CheckHealth
from tests.fakes import StaticProbe


async def test_all_ok() -> None:
    health = await CheckHealth("1.2.3", StaticProbe("ok"), StaticProbe("ok"), StaticProbe("not_configured")).execute()
    assert health.status == "ok" and health.version == "1.2.3"
    assert health.checks.storage == "not_configured"


async def test_failing_probe_degrades_without_raising() -> None:
    health = await CheckHealth(
        "1", StaticProbe(ConnectionError("db down")), StaticProbe("ok"), StaticProbe("ok")
    ).execute()
    assert health.status == "degraded" and health.checks.postgres == "error"


async def test_slow_probe_times_out(monkeypatch: object) -> None:
    class Slow:
        async def check(self) -> CheckStatus:
            await asyncio.sleep(10)
            return "ok"

    check_health.PROBE_TIMEOUT_SECONDS = 0.01
    try:
        health = await CheckHealth("1", StaticProbe("ok"), Slow(), StaticProbe("ok")).execute()
    finally:
        check_health.PROBE_TIMEOUT_SECONDS = 2.0
    assert health.checks.redis == "error"
