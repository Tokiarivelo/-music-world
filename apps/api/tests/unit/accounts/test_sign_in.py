from datetime import timedelta

import pytest

from music_world.accounts.domain.errors import AuthTokenInvalidError, EmailDeliveryError, EmailInvalidError
from music_world.accounts.domain.model import hash_token
from music_world.shared.container import build_accounts
from music_world.shared.settings import Settings
from tests.fakes import (
    CapturingEmailSender,
    FakeClock,
    InMemoryLoginTokenRepository,
    InMemorySessionRepository,
    InMemoryUserRepository,
    SequentialIds,
)


class Tokens:
    def __init__(self) -> None:
        self.n = 0

    def __call__(self) -> str:
        self.n += 1
        return f"tok{self.n:04d}" + "x" * 39


def _accounts(sender: CapturingEmailSender | None = None):  # type: ignore[no-untyped-def]
    clock = FakeClock()
    repos = InMemoryUserRepository(), InMemoryLoginTokenRepository(), InMemorySessionRepository()
    sender = sender or CapturingEmailSender()
    services = build_accounts(
        Settings(app_env="test", public_base_url="https://mw.example/"),
        *repos,
        sender,
        new_token=Tokens(),
        new_id=SequentialIds(),
        clock=clock,
    )
    return services, repos, sender, clock


async def test_magic_link_is_sent_with_a_hashed_token() -> None:
    services, (_, tokens, _), sender, _ = _accounts()
    await services.request_magic_link.execute(" Ada@Example.com")
    email, link = sender.sent[0]
    token = sender.last_token()
    assert email == "ada@example.com" and link == f"https://mw.example/auth/verify?token={token}"
    assert list(tokens.tokens) == [hash_token(token)] and token not in str(tokens.tokens)


async def test_invalid_address_and_sender_failure() -> None:
    services, *_ = _accounts()
    with pytest.raises(EmailInvalidError):
        await services.request_magic_link.execute("not-an-email")
    failing, *_ = _accounts(CapturingEmailSender(OSError("smtp down")))
    with pytest.raises(EmailDeliveryError):
        await failing.request_magic_link.execute("ada@example.com")


async def test_verify_creates_the_user_once_and_a_session() -> None:
    services, (users, _, sessions), sender, _ = _accounts()
    await services.request_magic_link.execute("ada@example.com")
    first = await services.verify_magic_link.execute(sender.last_token())
    await services.request_magic_link.execute("ADA@example.com")
    second = await services.verify_magic_link.execute(sender.last_token())
    assert first.user == second.user and len(users.users) == 1
    assert first.session_token != second.session_token and first.csrf_token != first.session_token
    assert hash_token(first.session_token) in sessions.sessions and first.session_token not in str(sessions.sessions)
    assert await services.resolve_session.execute(first.session_token) == first.user


async def test_token_is_single_use_and_unknown_tokens_fail_the_same_way() -> None:
    services, _, sender, _ = _accounts()
    await services.request_magic_link.execute("ada@example.com")
    token = sender.last_token()
    await services.verify_magic_link.execute(token)
    for bad in (token, "unknown", "", "x" * 500):
        with pytest.raises(AuthTokenInvalidError, match="invalid or has expired"):
            await services.verify_magic_link.execute(bad)


async def test_expired_token_and_session() -> None:
    services, _, sender, clock = _accounts()
    await services.request_magic_link.execute("ada@example.com")
    clock.now += timedelta(minutes=16)
    with pytest.raises(AuthTokenInvalidError):
        await services.verify_magic_link.execute(sender.last_token())
    await services.request_magic_link.execute("ada@example.com")
    signed_in = await services.verify_magic_link.execute(sender.last_token())
    clock.now += timedelta(days=31)
    assert await services.resolve_session.execute(signed_in.session_token) is None


async def test_sign_out_deletes_the_session() -> None:
    services, _, sender, _ = _accounts()
    await services.request_magic_link.execute("ada@example.com")
    signed_in = await services.verify_magic_link.execute(sender.last_token())
    await services.sign_out.execute(signed_in.session_token)
    assert await services.resolve_session.execute(signed_in.session_token) is None
    assert await services.resolve_session.execute(None) is None
    await services.sign_out.execute(None)
