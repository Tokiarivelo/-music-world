"""In-memory sliding-window rate limit per key (one API process; enough for the single-instance MVP)."""

from collections import deque
from collections.abc import Callable
from time import monotonic


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_sec: float, clock: Callable[[], float] = monotonic) -> None:
        self._limit, self._window, self._clock = limit, window_sec, clock
        self._hits: dict[str, deque[float]] = {}

    def allow(self, key: str) -> bool:
        now = self._clock()
        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] <= now - self._window:
            hits.popleft()
        if len(hits) >= self._limit:
            return False
        hits.append(now)
        if len(self._hits) > 10_000:  # bound memory: forget idle keys
            for k in [k for k, v in self._hits.items() if not v]:
                del self._hits[k]
        return True
