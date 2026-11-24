"""Director errors. `ProviderError` never reaches HTTP: the use case falls back to the next provider."""

from music_world.director.domain.providers import FallbackReason
from music_world.shared.errors import MusicWorldError, RateLimitedError

__all__ = ["DemoAnalysisMismatchError", "ProviderError", "RateLimitedError"]


class ProviderError(Exception):
    """A provider call failed (timeout, HTTP, refusal, invalid JSON). Carries no model output."""

    def __init__(self, reason: FallbackReason, message: str = "", *, cost_usd: float = 0.0) -> None:
        super().__init__(message or reason)
        self.reason: FallbackReason = reason
        self.cost_usd = cost_usd  # tokens already billed (refusal, truncated or invalid reply)


class DemoAnalysisMismatchError(MusicWorldError):
    code = "DEMO_ANALYSIS_MISMATCH"
