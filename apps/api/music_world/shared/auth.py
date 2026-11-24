"""Who is calling: FastAPI dependencies shared by every context (06-template-store design § Accounts).

The session cookie is resolved by the accounts context's `ResolveSession` use case found on the container, so no
context imports another one. Unsafe methods sent with a session cookie must echo the `mw_csrf` cookie in
`X-CSRF-Token` (double-submit token).
"""

import hmac
from dataclasses import dataclass
from typing import Annotated, Protocol

from fastapi import Depends, Path, Request

from music_world.shared.errors import MusicWorldError, NotFoundError

SESSION_COOKIE = "mw_session"
CSRF_COOKIE = "mw_csrf"
CSRF_HEADER = "X-CSRF-Token"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


class AuthRequiredError(MusicWorldError):
    code = "AUTH_REQUIRED"


class NotAModeratorError(NotFoundError):
    """Moderation routes do not exist for anyone but a moderator (404, never 403)."""

    code = "NOT_FOUND"


class CsrfFailedError(MusicWorldError):
    code = "CSRF_FAILED"


class _SignedInUser(Protocol):
    @property
    def id(self) -> str: ...
    @property
    def display_name(self) -> str: ...
    @property
    def email(self) -> str: ...


@dataclass(frozen=True)
class Caller:
    ip: str
    user_id: str | None = None
    display_name: str | None = None
    email: str | None = None

    @property
    def rate_key(self) -> str:
        """Rate limits count per user when signed in, per client IP otherwise."""
        return f"user:{self.user_id}" if self.user_id else f"ip:{self.ip}"


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def check_csrf(request: Request) -> None:
    cookie = request.cookies.get(CSRF_COOKIE, "")
    header = request.headers.get(CSRF_HEADER, "")
    if not cookie or not hmac.compare_digest(cookie.encode(), header.encode()):
        raise CsrfFailedError("missing or invalid CSRF token")


async def current_caller(request: Request) -> Caller:
    cached: Caller | None = getattr(request.state, "caller", None)
    if cached is not None:
        return cached
    token = request.cookies.get(SESSION_COOKIE)
    user: _SignedInUser | None = None
    if token:
        user = await request.app.state.container.accounts.resolve_session.execute(token)
    if user is not None and request.method not in SAFE_METHODS:
        check_csrf(request)
    caller = Caller(client_ip(request), user.id, user.display_name, user.email) if user else Caller(client_ip(request))
    request.state.caller = caller
    return caller


async def require_user(caller: Annotated[Caller, Depends(current_caller)]) -> Caller:
    if caller.user_id is None:
        raise AuthRequiredError("sign in first")
    return caller


CurrentCaller = Annotated[Caller, Depends(current_caller)]
SignedInCaller = Annotated[Caller, Depends(require_user)]


async def accessible_project(
    project_id: Annotated[str, Path(max_length=64)], request: Request, caller: CurrentCaller
) -> str:
    """Path dependency of every `/api/projects/{project_id}/…` route: 404 unless the caller may read the project."""
    await request.app.state.container.check_project_access.execute(project_id, caller.user_id)
    return project_id


AccessibleProjectId = Annotated[str, Depends(accessible_project)]


async def require_moderator(request: Request) -> Caller:
    """404 for anyone who is not a moderator (also when the CSRF check would fail), and for everyone when
    `MODERATOR_EMAILS` is empty: no hint that the routes exist."""
    container = request.app.state.container
    moderators = container.accounts.moderators
    if not moderators.is_enabled():
        raise NotAModeratorError("not found")
    token = request.cookies.get(SESSION_COOKIE)
    user = await container.accounts.resolve_session.execute(token) if token else None
    if user is None or not moderators.is_moderator(user.email):
        raise NotAModeratorError("not found")
    return await current_caller(request)  # CSRF applies to a real moderator


ModeratorCaller = Annotated[Caller, Depends(require_moderator)]
