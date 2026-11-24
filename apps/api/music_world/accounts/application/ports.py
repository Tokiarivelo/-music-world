"""Ports of the accounts context (implemented in infrastructure/)."""

from collections.abc import Callable
from datetime import datetime
from typing import Protocol

from music_world.accounts.domain.model import LoginToken, Session, User

Clock = Callable[[], datetime]
IdGenerator = Callable[[], str]
TokenGenerator = Callable[[], str]


class UserRepository(Protocol):
    async def get(self, user_id: str) -> User | None: ...
    async def get_by_email(self, email: str) -> User | None: ...
    async def add(self, user: User) -> None: ...


class LoginTokenRepository(Protocol):
    async def add(self, token: LoginToken) -> None: ...

    async def consume(self, token_hash: str, now: datetime) -> str | None:
        """Atomically marks an unused, unexpired token as used and returns its e-mail; None otherwise."""
        ...


class SessionRepository(Protocol):
    async def add(self, session: Session) -> None: ...
    async def get(self, token_hash: str) -> Session | None: ...
    async def delete(self, token_hash: str) -> None: ...


class EmailSender(Protocol):
    async def send_sign_in_link(self, email: str, link: str) -> None: ...


class ModeratorDirectory(Protocol):
    def is_enabled(self) -> bool:
        """False when no moderator is configured: the moderation routes then do not exist (404)."""
        ...

    def is_moderator(self, email: str) -> bool: ...
