"""Dependency probes for /api/health. Never include connection strings or secrets in results."""

import asyncio
from typing import TYPE_CHECKING

import boto3
from botocore.config import Config
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from music_world.shared.settings import Settings
from music_world.system.application.ports import CheckStatus

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client


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
        client: S3Client = boto3.client(
            "s3",
            endpoint_url=s.s3_endpoint,
            region_name=s.s3_region,
            aws_access_key_id=s.s3_access_key.get_secret_value(),
            aws_secret_access_key=s.s3_secret_key.get_secret_value(),
            config=Config(connect_timeout=1.5, read_timeout=1.5, retries={"max_attempts": 1}),
        )
        await asyncio.to_thread(client.head_bucket, Bucket=s.s3_bucket or "")
        return "ok"
