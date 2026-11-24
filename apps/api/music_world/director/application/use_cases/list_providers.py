"""Which providers can be selected (requirement 1.2)."""

from collections.abc import Mapping
from dataclasses import dataclass

from music_world.director.domain.providers import ProviderId


@dataclass(frozen=True)
class ProviderEntry:
    id: ProviderId
    model: str
    configured: bool


@dataclass(frozen=True)
class ProviderList:
    default: ProviderId
    providers: list[ProviderEntry]


class ListProviders:
    def __init__(self, models: Mapping[ProviderId, str], configured: set[ProviderId], default: ProviderId) -> None:
        self._result = ProviderList(
            default, [ProviderEntry(p, m, p in configured or p == "mock") for p, m in models.items()]
        )

    def execute(self) -> ProviderList:
        return self._result
