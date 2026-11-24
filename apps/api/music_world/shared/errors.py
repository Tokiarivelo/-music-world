"""Base error of every domain error. Interfaces map `code` to an HTTP status."""


class MusicWorldError(Exception):
    code: str = "INTERNAL_ERROR"

    def __init__(self, message: str, *, details: list[dict[str, object]] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or []


class NotFoundError(MusicWorldError):
    code = "NOT_FOUND"


class RateLimitedError(MusicWorldError):
    code = "RATE_LIMITED"
