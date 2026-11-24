"""`GenerateWorld` with fake ports: chain order, retry once, cache, spend cap, timeout (requirements 1, 3, 5)."""

import asyncio
from typing import Any

import pytest

from music_world.director.application.ports import PromptRequest, ProviderReply
from music_world.director.application.summary import summarize
from music_world.director.application.use_cases.generate_world import (
    GenerateDemoWorld,
    GenerateProjectWorld,
    GenerateWorld,
    GenerateWorldCommand,
    cache_key,
)
from music_world.director.domain.errors import DemoAnalysisMismatchError, ProviderError
from music_world.director.domain.providers import ProviderId
from music_world.director.infrastructure.default_template import default_template
from music_world.director.infrastructure.prompts import PROMPT_VERSION, DirectorPromptSet
from music_world.director.infrastructure.providers.mock import MockProvider
from music_world.schemas.analysis import AnalysisResult
from music_world.schemas.template import WorldTemplate
from tests.unit.director.helpers import FakeProvider, MemoryCache, MemorySpend, small_analysis, valid_llm_template


def make(
    providers: dict[ProviderId, Any], *, default: ProviderId = "muse", spend: MemorySpend | None = None, **kw: Any
) -> tuple[GenerateWorld, MemoryCache, MemorySpend]:
    cache, spend = MemoryCache(), spend or MemorySpend()
    chain = {**providers, "mock": providers.get("mock", MockProvider())}
    use_case = GenerateWorld(
        chain, DirectorPromptSet(), cache, spend, default_template(), default_provider=default, spend_cap_usd=1.0, **kw
    )
    return use_case, cache, spend


async def test_selected_provider_result_is_validated_stamped_and_cached() -> None:
    muse = FakeProvider("muse", [valid_llm_template()], model="muse-spark-1.3-contributor")
    use_case, cache, spend = make({"muse": muse})
    result = await use_case.execute(GenerateWorldCommand(small_analysis()))
    assert (result.provider, result.model, result.requested_provider, result.cached) == (
        "muse",
        "muse-spark-1.3-contributor",
        "muse",
        False,
    )
    assert result.template["meta"]["generatedBy"] == {
        "provider": "muse",
        "model": "muse-spark-1.3-contributor",
        "promptVersion": PROMPT_VERSION,
    }
    assert result.template["id"].startswith("ai-muse-")
    WorldTemplate.model_validate(result.template)
    assert len(cache.items) == 1 and spend.total[small_analysis().audio_hash] == pytest.approx(0.01)
    again = await use_case.execute(GenerateWorldCommand(small_analysis()))
    assert again.cached and again.template == result.template and len(muse.requests) == 1


async def test_the_prompt_is_the_summary_with_the_schema() -> None:
    muse = FakeProvider("muse", [valid_llm_template()])
    use_case, _, _ = make({"muse": muse})
    await use_case.execute(GenerateWorldCommand(small_analysis()))
    request = muse.requests[0]
    assert '"WorldTemplate"' in request.system and summarize(small_analysis()).text() in request.user
    assert request.schema["title"] == "WorldTemplate" and request.audio is None


async def test_invalid_output_is_retried_once_with_the_errors() -> None:
    bad = valid_llm_template() | {"mappings": [{"when": {}, "spawn": "recipe:x"}]}
    muse = FakeProvider("muse", [bad, valid_llm_template()])
    use_case, _, _ = make({"muse": muse})
    result = await use_case.execute(GenerateWorldCommand(small_analysis()))
    assert result.provider == "muse" and len(muse.requests) == 2
    assert "rejected by the validator" in muse.requests[1].user and "recipe" in muse.requests[1].user


async def test_twice_invalid_falls_back_to_the_other_provider_then_mock() -> None:
    muse = FakeProvider("muse", [{"nope": 1}, {"nope": 2}])
    bedrock = FakeProvider("bedrock", [ProviderError("TIMEOUT")])
    use_case, _, _ = make({"muse": muse, "bedrock": bedrock})
    result = await use_case.execute(GenerateWorldCommand(small_analysis()))
    assert result.provider == "mock" and result.template["id"].startswith("ai-mock-")
    assert [(s.provider, s.reason) for s in result.fallbacks] == [("muse", "INVALID_OUTPUT"), ("bedrock", "TIMEOUT")]


async def test_order_is_selected_then_other_real_provider() -> None:
    muse = FakeProvider("muse", [valid_llm_template()])
    bedrock = FakeProvider("bedrock", [ProviderError("HTTP_ERROR")])
    use_case, _, _ = make({"muse": muse, "bedrock": bedrock})
    result = await use_case.execute(GenerateWorldCommand(small_analysis(), "bedrock"))
    assert result.provider == "muse" and result.requested_provider == "bedrock"
    assert [(s.provider, s.reason) for s in result.fallbacks] == [("bedrock", "HTTP_ERROR")]


async def test_unconfigured_selection_is_reported_and_mock_used() -> None:
    use_case, _, _ = make({})
    result = await use_case.execute(GenerateWorldCommand(small_analysis(), "bedrock"))
    assert result.provider == "mock" and [(s.provider, s.reason) for s in result.fallbacks] == [
        ("bedrock", "NOT_CONFIGURED")
    ]


async def test_spend_cap_switches_to_mock_without_calling_the_provider() -> None:
    muse = FakeProvider("muse", [valid_llm_template()])
    use_case, _, _ = make({"muse": muse}, spend=MemorySpend(spent=1.0))
    result = await use_case.execute(GenerateWorldCommand(small_analysis()))
    assert result.provider == "mock" and muse.requests == []
    assert [(s.provider, s.reason) for s in result.fallbacks] == [("muse", "SPEND_CAP")]


async def test_spend_accumulates_until_the_cap() -> None:
    muse = FakeProvider("muse", [{"bad": 1}, {"bad": 2}], cost=0.6)
    use_case, _, spend = make({"muse": muse})
    result = await use_case.execute(GenerateWorldCommand(small_analysis()))
    # First call spends 0.6, the retry 0.6 more (cap 1.0 not yet reached before it); then mock.
    assert len(muse.requests) == 2 and spend.total[small_analysis().audio_hash] == pytest.approx(1.2)
    assert result.provider == "mock"
    muse2 = FakeProvider("muse", [valid_llm_template()])
    use_case2, _, _ = make({"muse": muse2}, spend=spend)
    assert (await use_case2.execute(GenerateWorldCommand(small_analysis()))).provider == "mock"
    assert muse2.requests == []


class SlowProvider(FakeProvider):
    async def complete_json(self, request: PromptRequest) -> ProviderReply:
        await asyncio.sleep(5)
        return ProviderReply({}, 0)


async def test_timeout_falls_back() -> None:
    use_case, _, _ = make({"muse": SlowProvider("muse", [])}, timeout_sec=0.05)
    result = await use_case.execute(GenerateWorldCommand(small_analysis()))
    assert result.provider == "mock" and result.fallbacks[0].reason == "TIMEOUT"


def test_cache_key_includes_provider_model_prompt_version_and_summary() -> None:
    summary = summarize(small_analysis())
    base = cache_key(summary, "muse", "m", "v1")
    assert (
        len(
            {
                base,
                cache_key(summary, "bedrock", "m", "v1"),
                cache_key(summary, "muse", "m2", "v1"),
                cache_key(summary, "muse", "m", "v2"),
                cache_key(summarize(small_analysis(key="A minor")), "muse", "m", "v1"),
            }
        )
        == 5
    )


async def test_regenerating_with_another_provider_keeps_both_templates() -> None:
    muse = FakeProvider("muse", [valid_llm_template()])
    use_case, cache, _ = make({"muse": muse})
    a = await use_case.execute(GenerateWorldCommand(small_analysis(), "muse"))
    b = await use_case.execute(GenerateWorldCommand(small_analysis(), "mock"))
    assert a.template["id"] != b.template["id"] and len(cache.items) == 2


class BrokenMock(FakeProvider):
    def __init__(self) -> None:
        super().__init__("mock", [], model="mock-director-1")


async def test_default_template_when_even_the_mock_fails() -> None:
    use_case, _, _ = make({"mock": BrokenMock()})
    result = await use_case.execute(GenerateWorldCommand(small_analysis()))
    assert result.template["id"] == "neon-nocturne" and result.provider == "mock"


class Analyses:
    def __init__(self, analysis: AnalysisResult) -> None:
        self.analysis = analysis

    async def execute(self, project_id: str) -> AnalysisResult:
        return self.analysis


async def test_project_and_demo_use_cases() -> None:
    use_case, _, _ = make({})
    project = await GenerateProjectWorld(Analyses(small_analysis()), use_case).execute("p", "mock")
    assert project.provider == "mock"
    with pytest.raises(DemoAnalysisMismatchError):
        await GenerateDemoWorld(use_case).execute(small_analysis())
    demo = await GenerateDemoWorld(use_case, small_analysis().audio_hash).execute(small_analysis())
    assert demo.provider == "mock"


def test_the_mock_is_required() -> None:
    with pytest.raises(ValueError):
        GenerateWorld(
            {}, DirectorPromptSet(), MemoryCache(), MemorySpend(), {}, default_provider="mock", spend_cap_usd=1
        )


async def test_billed_failures_count_toward_the_cap() -> None:
    muse = FakeProvider("muse", [ProviderError("REFUSED", cost_usd=0.4)])
    use_case, _, spend = make({"muse": muse})
    result = await use_case.execute(GenerateWorldCommand(small_analysis()))
    assert result.provider == "mock" and spend.total[small_analysis().audio_hash] == pytest.approx(0.4)
