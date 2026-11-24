"""Dependency probes for /api/health. Never include connection strings or secrets in results."""

import asyncio
from typing import TYPE_CHECKING

from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from music_world.shared.settings import Settings
from music_world.system.application.ports import CheckStatus

if TYPE_CHECKING:
    pass


class PostgresProbe:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def check(self) -> CheckStatus:
        async with self._engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return "ok"


class RedisProbe:
    def __init__(self, redis: "Redis") -> None:
        self._redis = redis

    async def check(self) -> CheckStatus:
        await self._redis.ping()
        return "ok"


class S3Probe:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def check(self) -> CheckStatus:
        s = self._settings
        if not s.storage_configured or s.s3_access_key is None or s.s3_secret_key is None:
            return "not_configured"
        from music_world.shared.object_store import build_s3_client

        client = build_s3_client(s, connect_timeout=1.5, read_timeout=1.5, retries=1)
        await asyncio.to_thread(client.head_bucket, Bucket=s.s3_bucket or "")
        return "ok"
