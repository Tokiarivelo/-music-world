"""Runtime settings, read only from environment variables (never returned by the API)."""

from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from music_world import __version__


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore", case_sensitive=False)

    app_env: Literal["development", "test", "production"] = "development"
    app_version: str = __version__
    log_level: str = "INFO"
    api_docs: bool = False

    database_url: str = "postgresql+asyncpg://music_world:music_world@localhost:5432/music_world"
    redis_url: str = "redis://localhost:6379/0"

    s3_endpoint: str | None = None
    s3_region: str | None = None
    s3_bucket: str | None = None
    s3_access_key: SecretStr | None = None
    s3_secret_key: SecretStr | None = None

    @property
    def storage_configured(self) -> bool:
        return bool(self.s3_endpoint and self.s3_bucket and self.s3_access_key and self.s3_secret_key)

    @property
    def docs_enabled(self) -> bool:
        return self.api_docs or self.app_env == "development"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
