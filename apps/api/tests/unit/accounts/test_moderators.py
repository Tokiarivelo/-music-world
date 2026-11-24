from datetime import UTC, datetime

from music_world.accounts.domain.model import User
from music_world.accounts.infrastructure.moderators import EmailHashModeratorDirectory


def _user(email: str) -> User:
    return User(id="u1", email=email, display_name="creator-1", created_at=datetime(2026, 1, 1, tzinfo=UTC))


def test_empty_list_disables_the_feature() -> None:
    directory = EmailHashModeratorDirectory("")
    assert not directory.is_enabled()
    assert not directory.is_moderator(_user("ada@example.com"))


def test_blank_items_are_ignored() -> None:
    assert not EmailHashModeratorDirectory(" , ,").is_enabled()


def test_match_is_case_insensitive_and_trimmed() -> None:
    directory = EmailHashModeratorDirectory(" Ada@Example.com , bob@example.com ")
    assert directory.is_enabled()
    assert directory.is_moderator(_user("ADA@example.COM"))
    assert directory.is_moderator(_user("bob@example.com"))


def test_non_moderator_is_refused() -> None:
    assert not EmailHashModeratorDirectory("ada@example.com").is_moderator(_user("eve@example.com"))
