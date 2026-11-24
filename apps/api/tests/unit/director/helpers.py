"""Shared builders and fakes of the director tests."""

import json
from pathlib import Path
from typing import Any

from music_world.director.application.ports import PromptRequest, ProviderReply
from music_world.director.domain.errors import ProviderError
from music_world.director.domain.providers import ProviderId
from music_world.schemas.analysis import AnalysisResult
from tests.unit.test_analysis_schema import _base

DEMO_ANALYSIS = Path(__file__).resolve().parents[4] / "web/src/features/player/demo/neon-nocturne.analysis.json"


def small_analysis(**overrides: Any) -> AnalysisResult:
    return AnalysisResult.model_validate({**_base(), **overrides})


def demo_analysis() -> AnalysisResult:
    return AnalysisResult.model_validate(json.loads(DEMO_ANALYSIS.read_text()))


def valid_llm_template() -> dict[str, Any]:
    return {
        "name": "Midnight Glass",
        "palette": {
            "background": "#05051a",
            "terrain": "#141433",
            "primary": "#7c4dff",
            "accent": "#22d3ee",
            "secondary": "#ff4fd8",
            "staff": "#f0f8ff",
        },
        "mappings": [
            {"when": {"pitch": "<50"}, "spawn": "terrain_ridge"},
            {"when": {"pitch": ">70"}, "spawn": "crystal", "colorRole": "accent"},
            {"when": {}, "spawn": "building"},
        ],
        "fx": {"particles": "dust", "bloom": 1.1},
    }


class FakeProvider:
    """Replays scripted replies (dicts or exceptions) and records the requests."""

    def __init__(
        self, name: ProviderId, replies: list[dict[str, Any] | Exception], cost: float = 0.01, model: str = "m-1"
    ) -> None:
        self._name, self._model, self.replies, self.cost = name, model, list(replies), cost
        self.requests: list[PromptRequest] = []

    @property
    def name(self) -> ProviderId:
        return self._name

    @property
    def model(self) -> str:
        return self._model

    async def complete_json(self, request: PromptRequest) -> ProviderReply:
        self.requests.append(request)
        if not self.replies:
            raise ProviderError("HTTP_ERROR")
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return ProviderReply(reply, self.cost)


class MemoryCache:
    def __init__(self) -> None:
        self.items: dict[str, dict[str, Any]] = {}

    async def get(self, key: str) -> dict[str, Any] | None:
        return self.items.get(key)

    async def put(self, key: str, template: dict[str, Any]) -> None:
        self.items[key] = template


class MemorySpend:
    def __init__(self, spent: float = 0.0) -> None:
        self.total: dict[str, float] = {}
        self.initial = spent

    async def spent(self, audio_hash: str) -> float:
        return self.total.get(audio_hash, self.initial)

    async def add(self, audio_hash: str, usd: float) -> None:
        self.total[audio_hash] = await self.spent(audio_hash) + usd
