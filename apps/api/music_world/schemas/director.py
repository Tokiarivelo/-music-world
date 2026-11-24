"""AI World Director contracts: provider list, generation request and result."""

from typing import Literal

from pydantic import ConfigDict, Field

from music_world.schemas.analysis import AnalysisResult
from music_world.schemas.base import ContractModel
from music_world.schemas.template import WorldTemplate

RESULT_SCHEMA_ID = "music-world.director-result.v1"
PROVIDERS_SCHEMA_ID = "music-world.director-providers.v1"

ProviderName = Literal["muse", "bedrock", "mock"]
FallbackReason = Literal[
    "NOT_CONFIGURED",
    "SPEND_CAP",
    "TIMEOUT",
    "HTTP_ERROR",
    "RATE_LIMITED",
    "REFUSED",
    "INVALID_JSON",
    "INVALID_OUTPUT",
]


class ProviderInfo(ContractModel):
    id: ProviderName
    model: str
    configured: bool = Field(description="False when credentials are missing: the selector hides it.")


class DirectorProviders(ContractModel):
    """`GET /api/director/providers`: the default provider and which ones can be selected."""

    model_config = ConfigDict(
        title="DirectorProviders",
        json_schema_extra={
            "examples": [
                {
                    "default": "mock",
                    "providers": [
                        {"id": "muse", "model": "muse-spark-1.3-contributor", "configured": False},
                        {"id": "bedrock", "model": "anthropic.claude-sonnet-5-5", "configured": False},
                        {"id": "mock", "model": "mock-director-1", "configured": True},
                    ],
                }
            ]
        },
    )

    default: ProviderName
    providers: list[ProviderInfo]


class FallbackStep(ContractModel):
    provider: ProviderName
    reason: FallbackReason


class DirectorResult(ContractModel):
    """A generated world template and which provider produced it (fallbacks list the skipped providers)."""

    model_config = ConfigDict(title="DirectorResult")

    template: WorldTemplate
    provider: ProviderName
    model: str
    requested_provider: ProviderName
    cached: bool
    fallbacks: list[FallbackStep] = Field(default_factory=list)


class DirectorRequest(ContractModel):
    """Body of `POST /api/projects/{id}/director`. Without `provider`, `LLM_PROVIDER` is used."""

    model_config = ConfigDict(json_schema_extra={"examples": [{"provider": "muse"}]})

    provider: ProviderName | None = None


class DemoDirectorRequest(ContractModel):
    """Body of `POST /api/director/demo`: the shipped demo analysis (the demo song has no project)."""

    analysis: AnalysisResult
    provider: ProviderName | None = None
