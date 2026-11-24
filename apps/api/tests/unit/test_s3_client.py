import pytest

from music_world.shared.object_store import build_s3_client
from music_world.shared.settings import Settings


def _settings(**over: str) -> Settings:
    base = {
        "s3_endpoint": "http://127.0.0.1:3900",
        "s3_bucket": "music-world",
        "s3_access_key": "GKtest",
        "s3_secret_key": "secret",
    }
    return Settings(_env_file=None, **{**base, **over})  # type: ignore[arg-type]


def test_client_uses_path_style_and_the_r2_friendly_checksum_mode() -> None:
    client = build_s3_client(_settings(s3_region="garage"))
    config = client.meta.config
    assert config.s3 == {"addressing_style": "path"}
    assert config.request_checksum_calculation == "when_required"
    assert client.meta.region_name == "garage"


def test_region_defaults_to_auto_for_cloudflare_r2() -> None:
    client = build_s3_client(_settings(s3_endpoint="https://acc.r2.cloudflarestorage.com"))
    assert client.meta.region_name == "auto"


def test_incomplete_settings_are_refused() -> None:
    with pytest.raises(ValueError):
        build_s3_client(Settings(_env_file=None))  # type: ignore[call-arg]
