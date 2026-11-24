"""Ports of the director context (implemented in infrastructure/)."""

from dataclasses import dataclass
from typing import Any, Protocol

from music_world.director.application.summary import AnalysisSummary
from music_world.director.domain.providers import ProviderId
from music_world.schemas.analysis import AnalysisResult


@dataclass(frozen=True)
class PromptRequest:
    system: str
    user: str
    schema: dict[str, Any]
    summary: AnalysisSummary  # lets the deterministic mock work without parsing prompt text
    audio: bytes | None = None  # optional mood hint (requirement 2.3), never required


@dataclass(frozen=True)
class ProviderReply:
    data: dict[str, Any]  # parsed JSON object, not validated
    cost_usd: float = 0.0  # estimate (tokens × catalogue price)


class LLMProvider(Protocol):
    """Returns parsed JSON or raises `ProviderError`. Never validates business rules, never logs prompts."""

    @property
    def name(self) -> ProviderId: ...

    @property
    def model(self) -> str: ...

    async def complete_json(self, request: PromptRequest) -> ProviderReply: ...


class DirectorPrompts(Protocol):
    @property
    def version(self) -> str: ...

    def system(self, schema: dict[str, Any]) -> str: ...
    def user(self, summary: AnalysisSummary) -> str: ...
    def repair(self, summary: AnalysisSummary, errors: list[str]) -> str: ...


class DirectorCache(Protocol):
    """Generated templates keyed by (audio hash, summary digest, provider, model, prompt version)."""

    async def get(self, key: str) -> dict[str, Any] | None: ...
    async def put(self, key: str, template: dict[str, Any]) -> None: ...


class SpendTracker(Protocol):
    """Estimated USD spent per audio hash (requirement 5.2)."""

    async def spent(self, audio_hash: str) -> float: ...
    async def add(self, audio_hash: str, usd: float) -> None: ...


class ProjectAnalyses(Protocol):
    """The analysis of a project (implemented by the analysis context's `GetProjectAnalysis` use case)."""

    async def execute(self, project_id: str) -> AnalysisResult: ...
