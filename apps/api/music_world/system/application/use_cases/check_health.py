import asyncio
from typing import Literal

from music_world.schemas import DependencyChecks, Health
from music_world.system.application.ports import CheckStatus, DependencyProbe

PROBE_TIMEOUT_SECONDS = 2.0


class CheckHealth:
    def __init__(
        self, version: str, postgres: DependencyProbe, redis: DependencyProbe, storage: DependencyProbe
    ) -> None:
        self._version = version
        self._probes = {"postgres": postgres, "redis": redis, "storage": storage}

    async def execute(self) -> Health:
        results = await asyncio.gather(*(self._safe_check(p) for p in self._probes.values()))
        checks = dict(zip(self._probes, results, strict=True))
        status: Literal["ok", "degraded"] = "degraded" if "error" in results else "ok"
        return Health(status=status, version=self._version, checks=DependencyChecks.model_validate(checks))

    @staticmethod
    async def _safe_check(probe: DependencyProbe) -> CheckStatus:
        try:
            return await asyncio.wait_for(probe.check(), PROBE_TIMEOUT_SECONDS)
        except Exception:
            return "error"
