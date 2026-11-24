"""Users, sign-in tokens and sessions. Secrets are random tokens; only their SHA-256 hash is ever stored."""

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime

from music_world.accounts.domain.errors import EmailInvalidError

MAX_EMAIL_LENGTH = 254
# One `@`, no whitespace or control characters, a dot inside the domain (not at its ends).
_EMAIL = re.compile(r"^[^@\s\x00-\x1f\x7f]{1,64}@[^@\s\x00-\x1f\x7f.]+(\.[^@\s\x00-\x1f\x7f.]+)+$")


@dataclass(frozen=True)
class User:
    id: str
    email: str
    display_name: str
    created_at: datetime


@dataclass(frozen=True)
class Session:
    token_hash: str
    user_id: str
    expires_at: datetime
    created_at: datetime


@dataclass(frozen=True)
class LoginToken:
    token_hash: str
    email: str
    expires_at: datetime
    created_at: datetime


def normalize_email(raw: str) -> str:
    """Trimmed, lowercased address; raises `EmailInvalidError` for anything that is not a plausible address."""
    email = raw.strip().lower()
    if len(email) > MAX_EMAIL_LENGTH or not _EMAIL.match(email):
        raise EmailInvalidError("enter a valid e-mail address")
    return email


def hash_token(token: str) -> str:
    """SHA-256 hex of a random token (tokens have ≥ 256 bits of entropy, so no salt or slow hash is needed)."""
    return hashlib.sha256(token.encode()).hexdigest()


def default_display_name(user_id: str) -> str:
    """Public name shown in the gallery: never derived from the e-mail address."""
    return f"creator-{hashlib.sha256(user_id.encode()).hexdigest()[:6]}"
