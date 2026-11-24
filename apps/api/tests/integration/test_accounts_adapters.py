import smtplib
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from typing import Any

import pytest
import structlog

from music_world.accounts.domain.model import LoginToken, Session, User
from music_world.accounts.infrastructure.email_senders import ConsoleEmailSender, SmtpEmailSender
from music_world.accounts.infrastructure.sqlalchemy_repositories import (
    SqlAlchemyLoginTokenRepository,
    SqlAlchemySessionRepository,
    SqlAlchemyUserRepository,
)
from music_world.shared.db import Base, create_engine, create_session_factory

NOW = datetime(2026, 11, 25, 10, 0, tzinfo=UTC)


@pytest.fixture
async def sessions() -> AsyncIterator[Any]:
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield create_session_factory(engine)
    await engine.dispose()


async def test_users_round_trip(sessions: Any) -> None:
    repo = SqlAlchemyUserRepository(sessions)
    user = User("00000000-0000-7000-8000-000000000001", "ada@example.com", "creator-abcdef", NOW)
    await repo.add(user)
    assert await repo.get(user.id) == user
    assert await repo.get_by_email("ada@example.com") == user
    assert await repo.get_by_email("bob@example.com") is None


async def test_login_token_is_consumed_once_and_not_after_expiry(sessions: Any) -> None:
    repo = SqlAlchemyLoginTokenRepository(sessions)
    await repo.add(LoginToken("a" * 64, "ada@example.com", NOW + timedelta(minutes=15), NOW))
    await repo.add(LoginToken("b" * 64, "bob@example.com", NOW + timedelta(minutes=15), NOW))
    assert await repo.consume("a" * 64, NOW) == "ada@example.com"
    assert await repo.consume("a" * 64, NOW) is None
    assert await repo.consume("b" * 64, NOW + timedelta(minutes=16)) is None
    assert await repo.consume("c" * 64, NOW) is None


async def test_sessions_round_trip_and_delete(sessions: Any) -> None:
    repo = SqlAlchemySessionRepository(sessions)
    session = Session("d" * 64, "00000000-0000-7000-8000-000000000001", NOW + timedelta(days=30), NOW)
    await repo.add(session)
    assert await repo.get("d" * 64) == session
    await repo.delete("d" * 64)
    assert await repo.get("d" * 64) is None


class FakeSmtp:
    instances: list["FakeSmtp"] = []
    fail_first = 0

    def __init__(self, host: str, port: int, timeout: float) -> None:
        if FakeSmtp.fail_first > 0:
            FakeSmtp.fail_first -= 1
            raise smtplib.SMTPConnectError(421, b"busy")
        self.host, self.port, self.timeout = host, port, timeout
        self.calls: list[str] = []
        self.messages: list[EmailMessage] = []
        FakeSmtp.instances.append(self)

    def __enter__(self) -> "FakeSmtp":
        return self

    def __exit__(self, *exc: object) -> None:
        self.calls.append("quit")

    def starttls(self) -> None:
        self.calls.append("starttls")

    def login(self, user: str, password: str) -> None:
        self.calls.append(f"login:{user}")

    def send_message(self, message: EmailMessage) -> None:
        self.messages.append(message)


async def test_smtp_sender_uses_starttls_login_and_retries_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("music_world.accounts.infrastructure.email_senders.RETRY_BACKOFF_SEC", 0.0)
    FakeSmtp.instances, FakeSmtp.fail_first = [], 1
    sender = SmtpEmailSender(
        "smtp.example",
        587,
        "Music World <no-reply@mw.example>",
        username="u",
        password="p",
        smtp_class=FakeSmtp,  # type: ignore[arg-type]
    )
    await sender.send_sign_in_link("ada@example.com", "https://mw.example/auth/verify?token=t")
    smtp = FakeSmtp.instances[0]
    assert (smtp.host, smtp.port, smtp.timeout) == ("smtp.example", 587, 10.0)
    assert smtp.calls == ["starttls", "login:u", "quit"]
    message = smtp.messages[0]
    assert message["To"] == "ada@example.com" and "token=t" in message.get_content()
    FakeSmtp.instances, FakeSmtp.fail_first = [], 2
    with pytest.raises(smtplib.SMTPConnectError):
        await sender.send_sign_in_link("ada@example.com", "https://x")


async def test_console_sender_logs_the_link_but_not_the_address() -> None:
    with structlog.testing.capture_logs() as logs:
        await ConsoleEmailSender().send_sign_in_link("ada@example.com", "https://mw.example/auth/verify?token=t")
    assert logs[0]["link"].endswith("token=t") and "ada@example.com" not in str(logs)
