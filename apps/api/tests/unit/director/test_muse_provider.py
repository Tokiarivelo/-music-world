"""Muse adapter against a hand-written fixture in the documented chat-completions shape (no network)."""

import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from music_world.director.application.ports import PromptRequest
from music_world.director.application.summary import summarize
from music_world.director.application.template_output import parse_template, template_json_schema
from music_world.director.domain.errors import ProviderError
from music_world.director.infrastructure.providers.muse import MuseProvider, is_contributor_model
from music_world.shared.container import _real_providers
from music_world.shared.settings import Settings
from tests.unit.director.helpers import small_analysis

FIXTURE = json.loads((Path(__file__).resolve().parents[2] / "fixtures/director/muse-chat-completion.json").read_text())
GEN = {"provider": "muse", "model": "muse-spark-1.3", "promptVersion": "director-v1"}


def request() -> PromptRequest:
    return PromptRequest("system text", "user text", template_json_schema(), summarize(small_analysis()))


def provider(handler: Any) -> tuple[MuseProvider, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def record(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return handler(req)

    return MuseProvider("sk-test", "muse-spark-1.3", transport=httpx.MockTransport(record), backoff_sec=0), seen


def with_content(content: str, refusal: str | None = None, **choice: Any) -> dict[str, Any]:
    doc = json.loads(json.dumps(FIXTURE))
    doc["choices"][0]["message"] |= {"content": content, "refusal": refusal}
    doc["choices"][0].update(choice)
    return doc


async def test_request_shape_and_parsed_reply() -> None:
    muse, seen = provider(lambda r: httpx.Response(200, json=FIXTURE))
    reply = await muse.complete_json(request())
    sent = seen[0]
    body = json.loads(sent.content)
    assert sent.url == "https://api.meta.ai/v1/chat/completions" and sent.headers["authorization"] == "Bearer sk-test"
    assert body["model"] == "muse-spark-1.3" and body["max_completion_tokens"] == 8000
    assert [m["role"] for m in body["messages"]] == ["system", "user"]
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["schema"]["title"] == "WorldTemplate"
    assert reply.data["name"] == "Violet Rain"
    assert reply.cost_usd == pytest.approx((5210 * 1.25 + 640 * 4.25) / 1e6)
    template, errors = parse_template(reply.data, template_id="ai-muse-00000000", generated_by=GEN)
    assert errors == [] and template is not None


async def test_fenced_json_is_accepted() -> None:
    fenced = "```json\n" + FIXTURE["choices"][0]["message"]["content"] + "\n```"
    muse, _ = provider(lambda r: httpx.Response(200, json=with_content(fenced)))
    assert (await muse.complete_json(request())).data["name"] == "Violet Rain"


@pytest.mark.parametrize(
    ("payload", "reason"),
    [
        (with_content("Sure! Here is a world: {"), "INVALID_JSON"),
        (with_content("[1, 2]"), "INVALID_JSON"),
        (with_content("{}", finish_reason="length"), "INVALID_JSON"),
        (with_content("", refusal="I can't help with that"), "REFUSED"),
        (with_content("{}", finish_reason="content_filter"), "REFUSED"),
        ({"unexpected": True}, "INVALID_JSON"),
    ],
)
async def test_bad_replies_raise_provider_errors_with_their_cost(payload: dict[str, Any], reason: str) -> None:
    muse, _ = provider(lambda r: httpx.Response(200, json=payload))
    with pytest.raises(ProviderError) as info:
        await muse.complete_json(request())
    assert info.value.reason == reason
    if "usage" in payload:
        assert info.value.cost_usd > 0


async def test_429_and_5xx_are_retried_once() -> None:
    replies = [httpx.Response(429, headers={"retry-after": "0"}), httpx.Response(200, json=FIXTURE)]
    muse, seen = provider(lambda r: replies.pop(0))
    assert (await muse.complete_json(request())).data["name"] == "Violet Rain" and len(seen) == 2
    muse, seen = provider(
        lambda r: httpx.Response(503, json={"error": {"message": "overloaded", "type": "server_error"}})
    )
    with pytest.raises(ProviderError) as info:
        await muse.complete_json(request())
    assert info.value.reason == "HTTP_ERROR" and len(seen) == 2
    muse, seen = provider(lambda r: httpx.Response(429))
    with pytest.raises(ProviderError) as info:
        await muse.complete_json(request())
    assert info.value.reason == "RATE_LIMITED" and len(seen) == 2


async def test_client_errors_are_not_retried() -> None:
    body = {"error": {"message": "Invalid API key", "type": "authentication_error", "param": None, "code": None}}
    muse, seen = provider(lambda r: httpx.Response(401, json=body))
    with pytest.raises(ProviderError) as info:
        await muse.complete_json(request())
    assert info.value.reason == "HTTP_ERROR" and len(seen) == 1


async def test_timeouts_and_connection_errors() -> None:
    def timeout(r: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=r)

    def refused(r: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=r)

    for handler, reason in ((timeout, "TIMEOUT"), (refused, "HTTP_ERROR")):
        muse, _ = provider(handler)
        with pytest.raises(ProviderError) as info:
            await muse.complete_json(request())
        assert info.value.reason == reason


def test_contributor_ids_are_refused() -> None:
    assert is_contributor_model("muse-spark-1.3-contributor") and not is_contributor_model("muse-spark-1.3")
    with pytest.raises(ValueError):
        MuseProvider("sk", "muse-spark-1.3-contributor")
    with pytest.raises(ValueError):
        MuseProvider("", "muse-spark-1.3")
    settings = Settings(meta_api_key="sk", meta_director_model="muse-spark-1.3-contributor")  # type: ignore[arg-type]
    assert "muse" not in _real_providers(settings)


def test_muse_is_wired_only_with_a_key() -> None:
    assert _real_providers(Settings(meta_api_key=None)) == {}
    providers = _real_providers(Settings(meta_api_key="sk"))  # type: ignore[arg-type]
    assert providers["muse"].model == "muse-spark-1.3"
