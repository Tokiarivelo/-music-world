"""Accounts errors (stable codes, mapped to HTTP in `shared/http.py`)."""

from music_world.shared.errors import MusicWorldError


class EmailInvalidError(MusicWorldError):
    code = "EMAIL_INVALID"


class AuthTokenInvalidError(MusicWorldError):
    """Unknown, expired or already used sign-in token: one error for all cases (requirement 1.4)."""

    code = "AUTH_TOKEN_INVALID"


class EmailDeliveryError(MusicWorldError):
    code = "EMAIL_UNAVAILABLE"
