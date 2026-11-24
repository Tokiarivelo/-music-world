"""Meta Model API (Muse Spark) adapter: OpenAI-compatible `POST /chat/completions` (public preview).

Verified 2026-11-24 against https://dev.meta.ai/docs (chat completions schemas, structured output, error handling).
Never logs prompts, replies or the key.
"""

import asyncio
from typing import Any

import httpx
import structlog

from music_world.director.application.ports import PromptRequest, ProviderReply
from music_world.director.domain.errors import ProviderError
from music_world.director.domain.providers import ProviderId
from music_world.director.domain.spend import call_cost_usd
from music_world.director.infrastructure.providers._json import parse_json_object
from music_world.director.infrastructure.providers.pricing import price_of

log = structlog.get_logger(__name__)

MAX_COMPLETION_TOKENS = 8000
TIMEOUT_SEC = 30.0
RETRY_STATUSES = frozenset({429, 500, 502, 503})
BACKOFF_SEC = 0.5
MAX_RETRY_AFTER_SEC = 2.0


def is_contributor_model(model: str) -> bool:
    """`*-contributor` ids are cheaper and let Meta train on the inputs (upload page notice, decision 2026-11-24)."""
    return model.strip().lower().endswith("-contributor")


class MuseProvider:
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = "https://api.meta.ai/v1",
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        backoff_sec: float = BACKOFF_SEC,
    ) -> None:
        if not api_key:
            raise ValueError("META_API_KEY is empty")
        self._model, self._backoff = model, backoff_sec
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=TIMEOUT_SEC,
            transport=transport,
        )

    @property
    def name(self) -> ProviderId:
        return "muse"

    @property
    def model(self) -> str:
        return self._model

    def _body(self, request: PromptRequest) -> dict[str, Any]:
        return {
            "model": self._model,
            "messages": [
                {"role": "system", "content": request.system},
                {"role": "user", "content": request.user},
            ],
            "max_completion_tokens": MAX_COMPLETION_TOKENS,
            # Best effort (strict defaults to false): the server-side validation is the authority.
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "WorldTemplate", "schema": request.schema, "strict": False},
            },
        }

    async def _post(self, body: dict[str, Any]) -> httpx.Response:
        for attempt in range(2):
            try:
                response = await self._client.post("/chat/completions", json=body)
            except httpx.TimeoutException as exc:
                raise ProviderError("TIMEOUT") from exc
            except httpx.HTTPError as exc:
                raise ProviderError("HTTP_ERROR", type(exc).__name__) from exc
            if response.status_code not in RETRY_STATUSES or attempt == 1:
                return response
            delay = self._backoff
            retry_after = response.headers.get("retry-after")
            if retry_after and retry_after.replace(".", "", 1).isdigit():
                delay = max(delay, min(float(retry_after), MAX_RETRY_AFTER_SEC))
            log.info("director.muse_retry", status=response.status_code)
            await asyncio.sleep(delay)
        raise AssertionError("unreachable")

    async def complete_json(self, request: PromptRequest) -> ProviderReply:
        response = await self._post(self._body(request))
        if response.status_code == 429:
            raise ProviderError("RATE_LIMITED")
        if response.status_code >= 400:
            log.warning("director.muse_http_error", status=response.status_code)
            raise ProviderError("HTTP_ERROR", f"status {response.status_code}")
        try:
            payload = response.json()
            choice = payload["choices"][0]
            message = choice["message"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError("INVALID_JSON", "unexpected response shape") from exc
        usage = payload.get("usage") or {}
        cost = call_cost_usd(
            price_of(self._model), int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0)
        )
        log.info(
            "director.muse_reply",
            model=self._model,
            finish_reason=choice.get("finish_reason"),
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
        )
        if message.get("refusal") or choice.get("finish_reason") == "content_filter":
            raise ProviderError("REFUSED", cost_usd=cost)
        if choice.get("finish_reason") == "length":
            raise ProviderError("INVALID_JSON", "reply truncated", cost_usd=cost)
        try:
            return ProviderReply(parse_json_object(message.get("content")), cost)
        except ProviderError as exc:
            raise ProviderError(exc.reason, str(exc), cost_usd=cost) from exc

    async def aclose(self) -> None:
        await self._client.aclose()
