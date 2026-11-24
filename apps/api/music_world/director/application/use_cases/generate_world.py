"""Generate a world template from an analysis with the provider chain (requirements 1, 3, 5)."""

import asyncio
import hashlib
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

import structlog

from music_world.director.application.ports import (
    DirectorCache,
    DirectorPrompts,
    LLMProvider,
    ProjectAnalyses,
    PromptRequest,
    SpendTracker,
)
from music_world.director.application.summary import AnalysisSummary, summarize
from music_world.director.application.template_output import parse_template, template_json_schema
from music_world.director.domain.demo import DEMO_AUDIO_HASH
from music_world.director.domain.errors import DemoAnalysisMismatchError, ProviderError
from music_world.director.domain.providers import MOCK, FallbackReason, ProviderId, fallback_chain
from music_world.director.domain.spend import over_cap
from music_world.schemas.analysis import AnalysisResult

log = structlog.get_logger(__name__)


@dataclass(frozen=True)
class GenerateWorldCommand:
    analysis: AnalysisResult
    provider: ProviderId | None = None


@dataclass(frozen=True)
class FallbackStep:
    provider: ProviderId
    reason: FallbackReason


@dataclass(frozen=True)
class GeneratedWorld:
    template: dict[str, Any]
    provider: ProviderId
    model: str
    requested_provider: ProviderId
    cached: bool
    fallbacks: list[FallbackStep] = field(default_factory=list)


def cache_key(summary: AnalysisSummary, provider: ProviderId, model: str, prompt_version: str) -> str:
    """Requirement 5.1: (audio hash, provider, model id, prompt version), plus the summary digest (no poisoning)."""
    raw = "|".join([summary.audio_hash, summary.digest(), provider, model, prompt_version])
    return hashlib.sha256(raw.encode()).hexdigest()


class GenerateWorld:
    def __init__(
        self,
        providers: Mapping[ProviderId, LLMProvider],
        prompts: DirectorPrompts,
        cache: DirectorCache,
        spend: SpendTracker,
        fallback_template: dict[str, Any],
        *,
        default_provider: ProviderId,
        spend_cap_usd: float,
        timeout_sec: float = 30.0,
    ) -> None:
        if MOCK not in providers:
            raise ValueError("the mock provider is required (final fallback)")
        self._providers = dict(providers)
        self._prompts, self._cache, self._spend = prompts, cache, spend
        self._fallback = fallback_template
        self._default, self._cap, self._timeout = default_provider, spend_cap_usd, timeout_sec

    @property
    def configured(self) -> list[ProviderId]:
        return list(self._providers)

    async def execute(self, cmd: GenerateWorldCommand) -> GeneratedWorld:
        requested = cmd.provider or self._default
        summary = summarize(cmd.analysis)
        steps: list[FallbackStep] = []
        if requested != MOCK and requested not in self._providers:
            steps.append(FallbackStep(requested, "NOT_CONFIGURED"))
        for name in fallback_chain(requested, self._providers):
            provider = self._providers[name]
            key = cache_key(summary, name, provider.model, self._prompts.version)
            cached = await self._cache.get(key)
            if cached is not None:
                return GeneratedWorld(cached, name, provider.model, requested, True, steps)
            if name != MOCK and over_cap(await self._spend.spent(summary.audio_hash), self._cap):
                steps.append(FallbackStep(name, "SPEND_CAP"))
                continue
            try:
                doc = await self._generate(provider, summary, key)
            except ProviderError as exc:
                log.warning("director.provider_failed", provider=name, model=provider.model, reason=exc.reason)
                steps.append(FallbackStep(name, exc.reason))
                continue
            await self._cache.put(key, doc)
            log.info("director.generated", provider=name, model=provider.model, fallbacks=len(steps))
            return GeneratedWorld(doc, name, provider.model, requested, False, steps)
        log.error("director.default_template", fallbacks=len(steps))  # unreachable unless the mock breaks
        return GeneratedWorld(self._fallback, MOCK, self._providers[MOCK].model, requested, False, steps)

    async def _call(self, provider: LLMProvider, request: PromptRequest, audio_hash: str) -> dict[str, Any]:
        try:
            async with asyncio.timeout(self._timeout):
                reply = await provider.complete_json(request)
        except TimeoutError as exc:
            raise ProviderError("TIMEOUT") from exc
        if reply.cost_usd > 0:
            await self._spend.add(audio_hash, reply.cost_usd)
        return reply.data

    async def _generate(self, provider: LLMProvider, summary: AnalysisSummary, key: str) -> dict[str, Any]:
        schema = template_json_schema()
        system = self._prompts.system(schema)
        generated_by = {"provider": provider.name, "model": provider.model, "promptVersion": self._prompts.version}
        template_id = f"ai-{provider.name}-{key[:8]}"
        request = PromptRequest(system, self._prompts.user(summary), schema, summary)
        raw = await self._call(provider, request, summary.audio_hash)
        doc, errors = parse_template(raw, template_id=template_id, generated_by=generated_by)
        if doc is not None:
            return doc
        # Requirement 3.2: retry once with the validation errors.
        log.info("director.retry_invalid", provider=provider.name, errors=len(errors))
        if over_cap(await self._spend.spent(summary.audio_hash), self._cap) and provider.name != MOCK:
            raise ProviderError("SPEND_CAP")
        retry = PromptRequest(system, self._prompts.repair(summary, errors), schema, summary)
        raw = await self._call(provider, retry, summary.audio_hash)
        doc, errors = parse_template(raw, template_id=template_id, generated_by=generated_by)
        if doc is None:
            raise ProviderError("INVALID_OUTPUT")
        return doc


class GenerateProjectWorld:
    """The director on a project's analysis (`ANALYSIS_NOT_READY` / `PROJECT_NOT_FOUND` come from the analyses)."""

    def __init__(self, analyses: ProjectAnalyses, generate: GenerateWorld) -> None:
        self._analyses, self._generate = analyses, generate

    async def execute(self, project_id: str, provider: ProviderId | None = None) -> GeneratedWorld:
        analysis = await self._analyses.execute(project_id)
        return await self._generate.execute(GenerateWorldCommand(analysis, provider))


class GenerateDemoWorld:
    """The director on the shipped demo song's analysis only (the public demo cannot spend on arbitrary input)."""

    def __init__(self, generate: GenerateWorld, demo_audio_hash: str = DEMO_AUDIO_HASH) -> None:
        self._generate, self._hash = generate, demo_audio_hash

    async def execute(self, analysis: AnalysisResult, provider: ProviderId | None = None) -> GeneratedWorld:
        if analysis.audio_hash != self._hash:
            raise DemoAnalysisMismatchError("only the demo song analysis is accepted here")
        return await self._generate.execute(GenerateWorldCommand(analysis, provider))
