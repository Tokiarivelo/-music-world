"""Magic-link sign-in: request a link, verify it (single use), resolve and end sessions (requirement 1)."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import quote

import structlog

from music_world.accounts.application.ports import (
    Clock,
    EmailSender,
    IdGenerator,
    LoginTokenRepository,
    SessionRepository,
    TokenGenerator,
    UserRepository,
)
from music_world.accounts.domain.errors import AuthTokenInvalidError, EmailDeliveryError
from music_world.accounts.domain.model import (
    LoginToken,
    Session,
    User,
    default_display_name,
    hash_token,
    normalize_email,
)

log = structlog.get_logger(__name__)

MAX_TOKEN_LENGTH = 128


class RequestMagicLink:
    """Always succeeds for a valid address (no account enumeration); the link goes through the `EmailSender`."""

    def __init__(
        self,
        tokens: LoginTokenRepository,
        sender: EmailSender,
        new_token: TokenGenerator,
        clock: Clock,
        *,
        base_url: str,
        ttl: timedelta,
    ) -> None:
        self._tokens, self._sender, self._new_token, self._clock = tokens, sender, new_token, clock
        self._base_url, self._ttl = base_url.rstrip("/"), ttl

    async def execute(self, raw_email: str) -> None:
        email = normalize_email(raw_email)
        token, now = self._new_token(), self._clock()
        await self._tokens.add(LoginToken(hash_token(token), email, now + self._ttl, now))
        link = f"{self._base_url}/auth/verify?token={quote(token, safe='')}"
        try:
            await self._sender.send_sign_in_link(email, link)
        except Exception as error:  # SMTP down, refused, timeout: the address is never logged
            log.error("auth.email_failed", error_type=type(error).__name__, email_hash=hash_token(email)[:12])
            raise EmailDeliveryError("the sign-in e-mail could not be sent, try again later") from error


@dataclass(frozen=True)
class SignedIn:
    user: User
    session_token: str
    csrf_token: str
    expires_at: datetime


class VerifyMagicLink:
    def __init__(
        self,
        tokens: LoginTokenRepository,
        users: UserRepository,
        sessions: SessionRepository,
        new_token: TokenGenerator,
        new_id: IdGenerator,
        clock: Clock,
        *,
        session_ttl: timedelta,
    ) -> None:
        self._tokens, self._users, self._sessions = tokens, users, sessions
        self._new_token, self._new_id, self._clock, self._ttl = new_token, new_id, clock, session_ttl

    async def execute(self, token: str) -> SignedIn:
        now = self._clock()
        email = None
        if 0 < len(token) <= MAX_TOKEN_LENGTH:
            email = await self._tokens.consume(hash_token(token), now)
        if email is None:
            raise AuthTokenInvalidError("this sign-in link is invalid or has expired")
        user = await self._users.get_by_email(email)
        if user is None:
            user_id = self._new_id()
            user = User(user_id, email, default_display_name(user_id), now)
            await self._users.add(user)
        session_token = self._new_token()
        expires = now + self._ttl
        await self._sessions.add(Session(hash_token(session_token), user.id, expires, now))
        log.info("auth.signed_in", user_id=user.id)
        return SignedIn(user, session_token, self._new_token(), expires)


class ResolveSession:
    def __init__(self, sessions: SessionRepository, users: UserRepository, clock: Clock) -> None:
        self._sessions, self._users, self._clock = sessions, users, clock

    async def execute(self, token: str | None) -> User | None:
        if not token or len(token) > MAX_TOKEN_LENGTH:
            return None
        session = await self._sessions.get(hash_token(token))
        if session is None or session.expires_at <= self._clock():
            return None
        return await self._users.get(session.user_id)


class SignOut:
    def __init__(self, sessions: SessionRepository) -> None:
        self._sessions = sessions

    async def execute(self, token: str | None) -> None:
        if token and len(token) <= MAX_TOKEN_LENGTH:
            await self._sessions.delete(hash_token(token))
