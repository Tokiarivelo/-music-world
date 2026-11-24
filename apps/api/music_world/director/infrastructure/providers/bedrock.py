"""Claude in Amazon Bedrock adapter (`bedrock-mantle` Messages API, `anthropic[bedrock]` SDK).

Verified 2026-11-24: https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock — client
`AsyncAnthropicBedrockMantle`, model ids with the `anthropic.` prefix. Never logs prompts, replies or credentials.
"""

from typing import Any, Literal

import anthropic
import httpx2
import structlog
from anthropic import AsyncAnthropicBedrockMantle
from anthropic.types import MessageParam, OutputConfigParam

from music_world.director.application.ports import PromptRequest, ProviderReply
from music_world.director.domain.errors import ProviderError
from music_world.director.domain.providers import ProviderId
from music_world.director.domain.spend import call_cost_usd
from music_world.director.infrastructure.providers._json import parse_json_object
from music_world.director.infrastructure.providers.pricing import price_of

log = structlog.get_logger(__name__)

MAX_TOKENS = 8000
TIMEOUT_SEC = 30.0
# Thinking is adaptive by default on current Claude models; low effort keeps a world well inside 30 s.
EFFORT: Literal["low"] = "low"


class BedrockProvider:
    def __init__(
        self,
        model: str,
        region: str,
        *,
        access_key: str | None = None,
        secret_key: str | None = None,
        session_token: str | None = None,
        profile: str | None = None,
        bearer_token: str | None = None,
        http_client: httpx2.AsyncClient | None = None,
    ) -> None:
        self._model = model
        self._client = AsyncAnthropicBedrockMantle(
            aws_region=region,
            aws_access_key=access_key,
            aws_secret_key=secret_key,
            aws_session_token=session_token,
            aws_profile=profile,
            api_key=bearer_token,
            timeout=TIMEOUT_SEC,
            max_retries=1,  # one retry on 429 / 5xx / connection errors (SDK backoff)
            http_client=http_client,
        )

    @property
    def name(self) -> ProviderId:
        return "bedrock"

    @property
    def model(self) -> str:
        return self._model

    async def complete_json(self, request: PromptRequest) -> ProviderReply:
        messages: list[MessageParam] = [{"role": "user", "content": request.user}]
        output_config: OutputConfigParam = {"effort": EFFORT}
        try:
            message = await self._client.messages.create(
                model=self._model,
                max_tokens=MAX_TOKENS,
                system=request.system,
                messages=messages,
                output_config=output_config,
            )
        except anthropic.APITimeoutError as exc:
            raise ProviderError("TIMEOUT") from exc
        except anthropic.RateLimitError as exc:
            raise ProviderError("RATE_LIMITED") from exc
        except anthropic.APIStatusError as exc:
            log.warning("director.bedrock_http_error", status=exc.status_code)
            raise ProviderError("HTTP_ERROR", f"status {exc.status_code}") from exc
        except anthropic.APIConnectionError as exc:
            raise ProviderError("HTTP_ERROR", "connection error") from exc
        except anthropic.AnthropicError as exc:  # credentials or client configuration
            raise ProviderError("HTTP_ERROR", type(exc).__name__) from exc
        usage: Any = message.usage
        cost = call_cost_usd(price_of(self._model), int(usage.input_tokens or 0), int(usage.output_tokens or 0))
        log.info(
            "director.bedrock_reply",
            model=self._model,
            stop_reason=message.stop_reason,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
        )
        if message.stop_reason == "refusal":
            raise ProviderError("REFUSED", cost_usd=cost)
        if message.stop_reason == "max_tokens":
            raise ProviderError("INVALID_JSON", "reply truncated", cost_usd=cost)
        text = "".join(block.text for block in message.content if block.type == "text")
        try:
            return ProviderReply(parse_json_object(text), cost)
        except ProviderError as exc:
            raise ProviderError(exc.reason, str(exc), cost_usd=cost) from exc

    async def aclose(self) -> None:
        await self._client.close()
