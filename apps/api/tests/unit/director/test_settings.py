from music_world.shared.settings import Settings


def test_providers_are_unconfigured_without_credentials() -> None:
    s = Settings(_env_file=None)  # type: ignore[call-arg]
    assert not s.muse_configured and not s.bedrock_configured
    assert s.llm_provider == "muse" and s.meta_spend_cap_usd == 1 and s.director_timeout_sec == 30


def test_credentials_make_providers_configured() -> None:
    assert Settings(meta_api_key="k").muse_configured  # type: ignore[arg-type]
    assert not Settings(meta_api_key="").muse_configured  # type: ignore[arg-type]
    assert not Settings(aws_access_key_id="a", aws_secret_access_key="b").bedrock_configured  # type: ignore[arg-type]
    assert Settings(aws_region="us-east-1", aws_access_key_id="a", aws_secret_access_key="b").bedrock_configured  # type: ignore[arg-type]
    assert Settings(aws_region="us-east-1", aws_bearer_token_bedrock="t").bedrock_configured  # type: ignore[arg-type]
    assert Settings(aws_region="us-east-1", aws_profile="p").bedrock_configured
