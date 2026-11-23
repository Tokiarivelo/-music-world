"""Wall clock for timestamps (not the audio clock)."""

from datetime import UTC, datetime


def utc_now() -> datetime:
    return datetime.now(UTC)
