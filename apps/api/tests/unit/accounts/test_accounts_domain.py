import pytest
from hypothesis import given
from hypothesis import strategies as st

from music_world.accounts.domain.errors import EmailInvalidError
from music_world.accounts.domain.model import default_display_name, hash_token, normalize_email


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("  Ada@Example.COM ", "ada@example.com"), ("a.b+c@sub.example.org", "a.b+c@sub.example.org")],
)
def test_normalize_email_accepts_plausible_addresses(raw: str, expected: str) -> None:
    assert normalize_email(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "ada",
        "ada@",
        "@example.com",
        "ada@example",
        "a da@example.com",
        "ada@@example.com",
        "ada@example.com\n.x",
        "ada@.example.com",
        "ada@example.com.",
        "a\x00@example.com",
        "x" * 65 + "@example.com",
        "a@" + "b" * 260 + ".com",
    ],
)
def test_normalize_email_rejects_anything_else(raw: str) -> None:
    with pytest.raises(EmailInvalidError):
        normalize_email(raw)


@given(st.text(max_size=80))
def test_normalize_email_is_idempotent_and_never_keeps_whitespace(raw: str) -> None:
    try:
        email = normalize_email(raw)
    except EmailInvalidError:
        return
    assert normalize_email(email) == email
    assert email == email.lower() and email.count("@") == 1
    assert not any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in email)


def test_token_hash_and_display_name_do_not_reveal_inputs() -> None:
    assert len(hash_token("secret")) == 64 and "secret" not in hash_token("secret")
    name = default_display_name("0193-user")
    assert name.startswith("creator-") and len(name) == 14 and name == default_display_name("0193-user")
