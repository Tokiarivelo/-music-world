"""The director writes the object layout of the template the user chose (I41)."""

import asyncio
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

import structlog

from music_world.director.application.layout import inventory_of, mock_layout, parse_layout
from music_world.director.application.ports import LLMProvider, ProjectAnalyses, PromptRequest, SpendTracker
from music_world.director.application.summary import summarize
from music_world.director.domain.errors import ProviderError
from music_world.director.domain.providers import MOCK, FallbackReason, ProviderId, fallback_chain
from music_world.director.domain.spend import over_cap
from music_world.director.infrastructure.prompts.layout import LayoutPromptSet
from music_world.schemas.template import WorldLayout

log = structlog.get_logger(__name__)


@dataclass(frozen=True)
class LayoutStepSkipped:
    provider: ProviderId
    reason: FallbackReason


@dataclass(frozen=True)
class DirectedLayout:
    layout: WorldLayout
    provider: ProviderId
    model: str
    requested_provider: ProviderId
    fallbacks: list[LayoutStepSkipped] = field(default_factory=list)


class DirectLayout:
    def __init__(
        self,
        analyses: ProjectAnalyses,
        providers: Mapping[ProviderId, LLMProvider],
        spend: SpendTracker,
        *,
        default_provider: ProviderId,
        spend_cap_usd: float,
        timeout_sec: float = 30.0,
    ) -> None:
        self._analyses, self._providers, self._spend = analyses, dict(providers), spend
        self._default, self._cap, self._timeout = default_provider, spend_cap_usd, timeout_sec
        self._prompts = LayoutPromptSet()

    async def execute(self, project_id: str, template: dict[str, Any], provider: ProviderId | None) -> DirectedLayout:
        requested = provider or self._default
        analysis = await self._analyses.execute(project_id)
        summary = summarize(analysis)
        skipped: list[LayoutStepSkipped] = []
        if requested != MOCK and requested not in self._providers:
            skipped.append(LayoutStepSkipped(requested, "NOT_CONFIGURED"))
        for name in fallback_chain(requested, self._providers):
            chosen = self._providers[name]
            if name == MOCK:
                break
            if over_cap(await self._spend.spent(summary.audio_hash), self._cap):
                skipped.append(LayoutStepSkipped(name, "SPEND_CAP"))
                continue
            schema = WorldLayout.model_json_schema(by_alias=True)
            request = PromptRequest(
                self._prompts.system(schema), self._prompts.user(summary, inventory_of(template)), schema, summary
            )
            try:
                async with asyncio.timeout(self._timeout):
                    reply = await chosen.complete_json(request)
            except TimeoutError:
                skipped.append(LayoutStepSkipped(name, "TIMEOUT"))
                continue
            except ProviderError as exc:
                if exc.cost_usd > 0:
                    await self._spend.add(summary.audio_hash, exc.cost_usd)
                skipped.append(LayoutStepSkipped(name, exc.reason))
                continue
            if reply.cost_usd > 0:
                await self._spend.add(summary.audio_hash, reply.cost_usd)
            layout = parse_layout(reply.data, template)
            if layout is None:
                log.info("director.layout_invalid", provider=name)
                skipped.append(LayoutStepSkipped(name, "INVALID_OUTPUT"))
                continue
            return DirectedLayout(layout, name, chosen.model, requested, skipped)
        layout = WorldLayout.model_validate(mock_layout(template, summary.audio_hash))
        return DirectedLayout(layout, MOCK, self._providers[MOCK].model, requested, skipped)
