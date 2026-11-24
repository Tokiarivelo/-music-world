"""Object storage adapters (shared kernel). Contexts declare the subset they need as a port.

- `S3ObjectStore`: any S3-compatible store, used when the `S3_*` settings are complete: Garage in local development
  (`make dev-infra`), Cloudflare R2 once deployed (endpoint `https://<account>.r2.cloudflarestorage.com`, region
  `auto`).
- `LocalObjectStore`: a directory on disk (`STORAGE_DIR`), for development and tests while no bucket exists.
Keys are relative POSIX paths (`audio/<hash>.mp3`, `stems/<hash>/vocals.flac`, …).
"""

import asyncio
import shutil
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING

from music_world.shared.settings import Settings

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

_TIMEOUT_SECONDS = 30
_RETRIES = 3


def _check_key(key: str) -> str:
    path = PurePosixPath(key)
    if not key or path.is_absolute() or ".." in path.parts:
        raise ValueError(f"invalid object key: {key!r}")
    return key


def build_s3_client(
    settings: Settings,
    *,
    connect_timeout: float = _TIMEOUT_SECONDS,
    read_timeout: float = _TIMEOUT_SECONDS,
    retries: int = _RETRIES,
) -> "S3Client":
    """One boto3 client for Garage and R2: path-style addressing (Garage has no per-bucket DNS name) and checksums only
    when an operation requires them (R2 rejects the default CRC32 trailer of recent botocore versions)."""
    if not settings.storage_configured or settings.s3_access_key is None or settings.s3_secret_key is None:
        raise ValueError("S3 storage is not configured")
    import boto3  # loaded only when S3 is configured: ~0.3 s of API start-up
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        region_name=settings.s3_region or "auto",
        aws_access_key_id=settings.s3_access_key.get_secret_value(),
        aws_secret_access_key=settings.s3_secret_key.get_secret_value(),
        config=Config(
            connect_timeout=connect_timeout,
            read_timeout=read_timeout,
            retries={"max_attempts": retries, "mode": "standard"},
            s3={"addressing_style": "path"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


class LocalObjectStore:
    def __init__(self, root: Path) -> None:
        self._root = root

    def _path(self, key: str) -> Path:
        return self._root / _check_key(key)

    async def put_file(self, key: str, path: Path, content_type: str) -> None:
        target = self._path(key)

        def copy() -> None:
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_name(target.name + ".part")
            shutil.copyfile(path, tmp)
            tmp.replace(target)  # atomic: readers never see a half-written object

        await asyncio.to_thread(copy)

    async def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        target = self._path(key)

        def write() -> None:
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_name(target.name + ".part")
            tmp.write_bytes(data)
            tmp.replace(target)

        await asyncio.to_thread(write)

    async def get_bytes(self, key: str) -> bytes | None:
        target = self._path(key)
        return await asyncio.to_thread(lambda: target.read_bytes() if target.is_file() else None)

    async def get_file(self, key: str, dest: Path) -> bool:
        source = self._path(key)

        def copy() -> bool:
            if not source.is_file():
                return False
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, dest)
            return True

        return await asyncio.to_thread(copy)

    async def exists(self, key: str) -> bool:
        target = self._path(key)
        return await asyncio.to_thread(target.is_file)


class S3ObjectStore:
    def __init__(self, settings: Settings) -> None:
        self._bucket = settings.s3_bucket or ""
        self._client: S3Client = build_s3_client(settings)

    async def put_file(self, key: str, path: Path, content_type: str) -> None:
        await asyncio.to_thread(
            self._client.upload_file, str(path), self._bucket, _check_key(key), ExtraArgs={"ContentType": content_type}
        )

    async def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            self._client.put_object, Bucket=self._bucket, Key=_check_key(key), Body=data, ContentType=content_type
        )

    async def get_bytes(self, key: str) -> bytes | None:
        from botocore.exceptions import ClientError

        def get() -> bytes | None:
            try:
                return self._client.get_object(Bucket=self._bucket, Key=_check_key(key))["Body"].read()
            except ClientError as error:
                if error.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
                    return None
                raise

        return await asyncio.to_thread(get)

    async def get_file(self, key: str, dest: Path) -> bool:
        if not await self.exists(key):
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(self._client.download_file, self._bucket, _check_key(key), str(dest))
        return True

    async def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        def head() -> bool:
            try:
                self._client.head_object(Bucket=self._bucket, Key=_check_key(key))
                return True
            except ClientError as error:
                if error.response.get("Error", {}).get("Code") in ("NoSuchKey", "404", "NotFound"):
                    return False
                raise

        return await asyncio.to_thread(head)


ObjectStoreAdapter = LocalObjectStore | S3ObjectStore


def build_object_store(settings: Settings) -> ObjectStoreAdapter:
    if settings.storage_configured:
        return S3ObjectStore(settings)
    return LocalObjectStore(Path(settings.storage_dir))
