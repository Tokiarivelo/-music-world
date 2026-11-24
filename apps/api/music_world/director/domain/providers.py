"""Provider ids and the fallback chain (requirement 1.3): selected → other real provider → mock."""

from collections.abc import Collection
from typing import Literal

ProviderId = Literal["muse", "bedrock", "mock"]
REAL_PROVIDERS: tuple[ProviderId, ...] = ("muse", "bedrock")
MOCK: ProviderId = "mock"

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


def fallback_chain(selected: ProviderId, configured: Collection[ProviderId]) -> list[ProviderId]:
    """Providers to try in order. `mock` is always last and always present; unconfigured real ones are dropped.
    Selecting `mock` means the mock only (no paid call)."""
    if selected == MOCK:
        return [MOCK]
    chain: list[ProviderId] = []
    if selected in configured:
        chain.append(selected)
    chain += [p for p in REAL_PROVIDERS if p != selected and p in configured]
    chain.append(MOCK)
    return chain


def default_provider(preferred: ProviderId, configured: Collection[ProviderId]) -> ProviderId:
    """`LLM_PROVIDER` when it can run, else the first configured real provider, else `mock`."""
    return fallback_chain(preferred, configured)[0]
