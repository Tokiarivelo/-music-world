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
    # Local object storage used while the S3 settings are incomplete (development, tests).
    storage_dir: str = ".data/storage"

    # Analysis worker (02-music-analysis).
    analysis_min_velocity: float = 0.25
    demucs_model: str = "htdemucs"
    lyrics_provider: Literal["muse", "lrc", "none"] = "muse"

    # AI World Director (05-ai-world-director). Keys stay server side and are never returned or logged.
    llm_provider: Literal["muse", "bedrock", "mock"] = "muse"
    meta_api_key: SecretStr | None = None
    meta_base_url: str = "https://api.meta.ai/v1"
    meta_director_model: str = "muse-spark-1.3"
    meta_shape_model: str = "muse-wonder-1.0"
    meta_voice_model: str = "muse-voice-transcribe-1.0"
    meta_spend_cap_usd: float = 1.0
    aws_region: str | None = None
    aws_access_key_id: SecretStr | None = None
    aws_secret_access_key: SecretStr | None = None
    aws_session_token: SecretStr | None = None
    aws_profile: str | None = None
    aws_bearer_token_bedrock: SecretStr | None = None
    bedrock_model_id: str = "anthropic.claude-sonnet-5-5"
    bedrock_shape_model_id: str = "anthropic.claude-opus-5-5"
    director_timeout_sec: float = 30.0
    director_audio_hint: bool = False
    director_rate_limit_per_hour: int = 30

    @property
    def storage_configured(self) -> bool:
        return bool(self.s3_endpoint and self.s3_bucket and self.s3_access_key and self.s3_secret_key)

    @property
    def muse_configured(self) -> bool:
        return bool(self.meta_api_key and self.meta_api_key.get_secret_value())

    @property
    def bedrock_configured(self) -> bool:
        keys = bool(self.aws_access_key_id and self.aws_secret_access_key)
        return bool(self.aws_region) and (keys or bool(self.aws_profile) or bool(self.aws_bearer_token_bedrock))

    @property
    def docs_enabled(self) -> bool:
        return self.api_docs or self.app_env == "development"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
