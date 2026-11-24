"""Bedrock adapter against a hand-written Messages API fixture through a mocked HTTP transport (no network)."""

import json
from pathlib import Path
from typing import Any

import httpx2
import pytest

from music_world.director.application.ports import PromptRequest
from music_world.director.application.summary import summarize
from music_world.director.application.template_output import parse_template, template_json_schema
from music_world.director.domain.errors import ProviderError
from music_world.director.infrastructure.providers.bedrock import BedrockProvider
from music_world.shared.container import _real_providers
from music_world.shared.settings import Settings
from tests.unit.director.helpers import small_analysis

FIXTURE = json.loads((Path(__file__).resolve().parents[2] / "fixtures/director/bedrock-message.json").read_text())
GEN = {"provider": "bedrock", "model": "anthropic.claude-sonnet-5-5", "promptVersion": "director-v1"}


def request() -> PromptRequest:
    return PromptRequest("system text", "user text", template_json_schema(), summarize(small_analysis()))


def provider(handler: Any, **creds: str) -> tuple[BedrockProvider, list[httpx2.Request]]:
    seen: list[httpx2.Request] = []

    def record(req: httpx2.Request) -> httpx2.Response:
        seen.append(req)
        return handler(req)

    auth = creds or {"bearer_token": "bedrock-api-key-test"}
    client = httpx2.AsyncClient(transport=httpx2.MockTransport(record))
    return BedrockProvider("anthropic.claude-sonnet-5-5", "us-east-1", http_client=client, **auth), seen


def with_reply(**fields: Any) -> dict[str, Any]:
    return json.loads(json.dumps(FIXTURE)) | fields


async def test_request_shape_and_parsed_reply() -> None:
    bedrock, seen = provider(lambda r: httpx2.Response(200, json=FIXTURE))
    reply = await bedrock.complete_json(request())
    sent = seen[0]
    body = json.loads(sent.content)
    assert sent.url.host == "bedrock-mantle.us-east-1.api.aws" and sent.url.path.endswith("/v1/messages")
    assert body["model"] == "anthropic.claude-sonnet-5-5" and body["max_tokens"] == 8000
    assert body["system"] == "system text" and body["messages"] == [{"role": "user", "content": "user text"}]
    assert body["output_config"] == {"effort": "low"} and "temperature" not in body
    assert reply.data["name"] == "Glass Harbor"
    assert reply.cost_usd == pytest.approx((5400 * 2 + 820 * 10) / 1e6)
    template, errors = parse_template(reply.data, template_id="ai-bedrock-00000000", generated_by=GEN)
    assert errors == [] and template is not None


async def test_sigv4_credentials_sign_the_request() -> None:
    bedrock, seen = provider(
        lambda r: httpx2.Response(200, json=FIXTURE), access_key="AKIDEXAMPLE", secret_key="secret-example"
    )
    await bedrock.complete_json(request())
    assert seen[0].headers["authorization"].startswith("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/")


@pytest.mark.parametrize(
    ("payload", "reason"),
    [
        (with_reply(stop_reason="refusal", content=[]), "REFUSED"),
        (with_reply(stop_reason="max_tokens"), "INVALID_JSON"),
        (with_reply(content=[{"type": "text", "text": "Here you go: not json"}]), "INVALID_JSON"),
    ],
)
async def test_bad_replies_raise_provider_errors_with_their_cost(payload: dict[str, Any], reason: str) -> None:
    bedrock, _ = provider(lambda r: httpx2.Response(200, json=payload))
    with pytest.raises(ProviderError) as info:
        await bedrock.complete_json(request())
    assert info.value.reason == reason and info.value.cost_usd > 0


@pytest.mark.parametrize(
    ("status", "reason", "calls"),
    [
        (429, "RATE_LIMITED", 2),
        (529, "HTTP_ERROR", 2),
        (500, "HTTP_ERROR", 2),
        (400, "HTTP_ERROR", 1),
        (403, "HTTP_ERROR", 1),
    ],
)
async def test_http_errors(status: int, reason: str, calls: int) -> None:
    body = {"type": "error", "error": {"type": "api_error", "message": "fixture"}}
    bedrock, seen = provider(lambda r: httpx2.Response(status, json=body, headers={"retry-after": "0"}))
    with pytest.raises(ProviderError) as info:
        await bedrock.complete_json(request())
    assert info.value.reason == reason and len(seen) == calls


async def test_retry_then_success() -> None:
    replies = [
        httpx2.Response(
            503,
            json={"type": "error", "error": {"type": "overloaded_error", "message": "x"}},
            headers={"retry-after": "0"},
        ),
        httpx2.Response(200, json=FIXTURE),
    ]
    bedrock, seen = provider(lambda r: replies.pop(0))
    assert (await bedrock.complete_json(request())).data["name"] == "Glass Harbor" and len(seen) == 2


async def test_timeout() -> None:
    def slow(r: httpx2.Request) -> httpx2.Response:
        raise httpx2.ReadTimeout("slow", request=r)

    bedrock, _ = provider(slow)
    with pytest.raises(ProviderError) as info:
        await bedrock.complete_json(request())
    assert info.value.reason == "TIMEOUT"


def test_bedrock_is_wired_only_with_region_and_credentials() -> None:
    assert "bedrock" not in _real_providers(Settings(aws_access_key_id="a", aws_secret_access_key="b"))  # type: ignore[arg-type]
    providers = _real_providers(Settings(aws_region="eu-west-3", aws_bearer_token_bedrock="t"))  # type: ignore[arg-type]
    assert providers["bedrock"].model == "anthropic.claude-sonnet-5-5"
