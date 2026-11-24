"""`/api/auth`: magic-link sign-in, session and sign-out (06-template-store requirement 1)."""

from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Request, Response, status

from music_world.accounts.application.use_cases.sign_in import SignedIn
from music_world.accounts.domain.model import User, hash_token, normalize_email
from music_world.schemas.account import AuthSession, MagicLinkRequest, MagicLinkSent, VerifyRequest
from music_world.shared.auth import (
    CSRF_COOKIE,
    SAFE_METHODS,
    SESSION_COOKIE,
    CsrfFailedError,
    CurrentCaller,
    client_ip,
)
from music_world.shared.container import AccountServices
from music_world.shared.errors import RateLimitedError
from music_world.shared.http import ERROR_RESPONSES
from music_world.shared.settings import Settings


def _origin(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}".lower()


def _services(request: Request) -> AccountServices:
    """Also refuses cross-origin unsafe requests in production (login CSRF, design § Accounts)."""
    settings: Settings = request.app.state.container.settings
    origin = request.headers.get("origin")
    if (
        settings.app_env == "production"
        and request.method not in SAFE_METHODS
        and origin is not None
        and origin.lower() != _origin(settings.public_base_url)
    ):
        raise CsrfFailedError("cross-origin request refused")
    services: AccountServices = request.app.state.container.accounts
    return services


Services = Annotated[AccountServices, Depends(_services)]

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _session(user: User | None) -> AuthSession:
    if user is None:
        return AuthSession(user=None)
    return AuthSession.model_validate({"user": {"id": user.id, "email": user.email, "displayName": user.display_name}})


def _set_cookies(response: Response, signed_in: SignedIn, settings: Settings) -> None:
    max_age = settings.session_ttl_days * 86400
    common = {"max_age": max_age, "path": "/", "samesite": "lax", "secure": settings.session_cookie_secure}
    response.set_cookie(SESSION_COOKIE, signed_in.session_token, httponly=True, **common)  # type: ignore[arg-type]
    response.set_cookie(CSRF_COOKIE, signed_in.csrf_token, httponly=False, **common)  # type: ignore[arg-type]


def _clear_cookies(response: Response, settings: Settings) -> None:
    for name, http_only in ((SESSION_COOKIE, True), (CSRF_COOKIE, False)):
        response.delete_cookie(
            name, path="/", samesite="lax", secure=settings.session_cookie_secure, httponly=http_only
        )


@router.post(
    "/magic-link",
    response_model=MagicLinkSent,
    status_code=status.HTTP_202_ACCEPTED,
    summary="E-mail a single-use sign-in link (always 202 for a valid address: no account enumeration)",
    responses={
        403: ERROR_RESPONSES[403],
        422: ERROR_RESPONSES[422],
        429: ERROR_RESPONSES[429],
        503: ERROR_RESPONSES[503],
    },
)
async def request_magic_link(body: MagicLinkRequest, request: Request, services: Services) -> MagicLinkSent:
    email = normalize_email(body.email)
    if not services.link_ip_limiter.allow(client_ip(request)) or not services.link_email_limiter.allow(
        hash_token(email)
    ):
        raise RateLimitedError("too many sign-in links requested, try again later")
    await services.request_magic_link.execute(email)
    return MagicLinkSent()


@router.post(
    "/verify",
    response_model=AuthSession,
    summary="Exchange a sign-in link token for a session (sets the httpOnly session cookie)",
    responses={401: ERROR_RESPONSES[401], 403: ERROR_RESPONSES[403], 429: ERROR_RESPONSES[429]},
)
async def verify(body: VerifyRequest, request: Request, response: Response, services: Services) -> AuthSession:
    if not services.verify_ip_limiter.allow(client_ip(request)):
        raise RateLimitedError("too many sign-in attempts, try again later")
    signed_in = await services.verify_magic_link.execute(body.token)
    _set_cookies(response, signed_in, request.app.state.container.settings)
    return _session(signed_in.user)


@router.get("/session", response_model=AuthSession, summary="Who is signed in (`user` is null when nobody is)")
async def get_session(request: Request, services: Services) -> AuthSession:
    return _session(await services.resolve_session.execute(request.cookies.get(SESSION_COOKIE)))


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Sign out: deletes the session and clears the cookies",
    responses={403: ERROR_RESPONSES[403]},
)
async def logout(request: Request, services: Services, _: CurrentCaller) -> Response:
    await services.sign_out.execute(request.cookies.get(SESSION_COOKIE))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_cookies(response, request.app.state.container.settings)
    return response
