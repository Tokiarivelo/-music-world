"""Moderator directory backed by the `MODERATOR_EMAILS` setting (10-template-moderation requirement 1)."""

from music_world.accounts.domain.model import hash_token


def _hash(email: str) -> str:
    return hash_token(email.strip().lower())


class EmailHashModeratorDirectory:
    """Keeps only hashes of the configured e-mails; a user is a moderator when their e-mail hash matches."""

    def __init__(self, raw_emails: str) -> None:
        self._hashes = frozenset(_hash(item) for item in raw_emails.split(",") if item.strip())

    def is_enabled(self) -> bool:
        return bool(self._hashes)

    def is_moderator(self, email: str) -> bool:
        return _hash(email) in self._hashes
