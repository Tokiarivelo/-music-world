from music_world.accounts.infrastructure.moderators import EmailHashModeratorDirectory


def test_empty_list_disables_the_feature() -> None:
    directory = EmailHashModeratorDirectory("")
    assert not directory.is_enabled()
    assert not directory.is_moderator("ada@example.com")


def test_blank_items_are_ignored() -> None:
    assert not EmailHashModeratorDirectory(" , ,").is_enabled()


def test_match_is_case_insensitive_and_trimmed() -> None:
    directory = EmailHashModeratorDirectory(" Ada@Example.com , bob@example.com ")
    assert directory.is_enabled()
    assert directory.is_moderator("ADA@example.COM")
    assert directory.is_moderator("bob@example.com")


def test_non_moderator_is_refused() -> None:
    assert not EmailHashModeratorDirectory("ada@example.com").is_moderator("eve@example.com")
