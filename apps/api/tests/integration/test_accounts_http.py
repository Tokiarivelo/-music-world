"""Magic-link sign-in end to end, cookies, CSRF and project ownership (06-template-store requirements 1, 2)."""

from typing import Any

from httpx import ASGITransport, AsyncClient

from music_world.main import create_app
from music_world.shared.container import Container
from music_world.shared.settings import Settings
from tests.fakes import CapturingEmailSender, StaticProbe, wav_bytes
from tests.integration.test_http import LifespanManager, make_container


def _app(sender: CapturingEmailSender, **settings: Any) -> Any:
    def factory(s: Settings) -> Container:
        return make_container(s, StaticProbe("ok"), sender=sender)

    return create_app(Settings(**{"app_env": "test", **settings}), factory)


def _client(app: Any) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="https://test")


async def sign_in(client: AsyncClient, sender: CapturingEmailSender, email: str = "ada@example.com") -> str:
    """Signs `client` in; returns the CSRF token to echo in `X-CSRF-Token`."""
    sent = await client.post("/api/auth/magic-link", json={"email": email})
    assert sent.status_code == 202, sent.text
    verified = await client.post("/api/auth/verify", json={"token": sender.last_token()})
    assert verified.status_code == 200, verified.text
    return client.cookies["mw_csrf"]


async def test_sign_in_flow_sets_secure_cookies_and_signs_out() -> None:
    sender = CapturingEmailSender()
    app = _app(sender)
    async with _client(app) as c, LifespanManager(c):
        assert (await c.get("/api/auth/session")).json() == {"user": None}
        sent = await c.post("/api/auth/magic-link", json={"email": "Ada@Example.com"})
        assert (sent.status_code, sent.json()) == (202, {"status": "sent"})
        verified = await c.post("/api/auth/verify", json={"token": sender.last_token()})
        cookies = verified.headers.get_list("set-cookie")
        session = (await c.get("/api/auth/session")).json()
        no_csrf = await c.post("/api/auth/logout")
        out = await c.post("/api/auth/logout", headers={"X-CSRF-Token": c.cookies["mw_csrf"]})
        after = (await c.get("/api/auth/session")).json()
    assert verified.status_code == 200 and verified.json()["user"]["email"] == "ada@example.com"
    session_cookie = next(h for h in cookies if h.startswith("mw_session="))
    csrf_cookie = next(h for h in cookies if h.startswith("mw_csrf="))
    for attribute in ("HttpOnly", "Secure", "SameSite=lax", "Path=/", "Max-Age=2592000"):
        assert attribute.lower() in session_cookie.lower()
    assert "httponly" not in csrf_cookie.lower() and "secure" in csrf_cookie.lower()
    assert session["user"]["displayName"].startswith("creator-")
    assert (no_csrf.status_code, no_csrf.json()["error"]["code"]) == (403, "CSRF_FAILED")
    assert out.status_code == 204 and after == {"user": None}


async def test_bad_tokens_and_addresses() -> None:
    sender = CapturingEmailSender()
    async with _client(_app(sender)) as c, LifespanManager(c):
        bad_email = await c.post("/api/auth/magic-link", json={"email": "nope"})
        await c.post("/api/auth/magic-link", json={"email": "ada@example.com"})
        token = sender.last_token()
        first = await c.post("/api/auth/verify", json={"token": token})
        reused = await c.post("/api/auth/verify", json={"token": token})
        unknown = await c.post("/api/auth/verify", json={"token": "x" * 43})
    assert (bad_email.status_code, bad_email.json()["error"]["code"]) == (422, "EMAIL_INVALID")
    assert first.status_code == 200
    assert reused.json() == unknown.json() and (reused.status_code, reused.json()["error"]["code"]) == (
        401,
        "AUTH_TOKEN_INVALID",
    )


async def test_magic_links_are_rate_limited_per_address() -> None:
    sender = CapturingEmailSender()
    async with _client(_app(sender)) as c, LifespanManager(c):
        codes = [
            (await c.post("/api/auth/magic-link", json={"email": "ada@example.com"})).status_code for _ in range(6)
        ]
    assert codes == [202] * 5 + [429] and len(sender.sent) == 5


async def test_email_failure_is_503() -> None:
    async with _client(_app(CapturingEmailSender(OSError("down")))) as c, LifespanManager(c):
        response = await c.post("/api/auth/magic-link", json={"email": "ada@example.com"})
    assert (response.status_code, response.json()["error"]["code"]) == (503, "EMAIL_UNAVAILABLE")


async def test_production_refuses_cross_origin_sign_in() -> None:
    sender = CapturingEmailSender()
    app = _app(sender, app_env="production", public_base_url="https://mw.example")
    async with _client(app) as c, LifespanManager(c):
        evil = await c.post(
            "/api/auth/magic-link", json={"email": "a@b.co"}, headers={"Origin": "https://evil.example"}
        )
        ok = await c.post("/api/auth/magic-link", json={"email": "a@b.co"}, headers={"Origin": "https://mw.example"})
    assert (evil.status_code, ok.status_code) == (403, 202)


async def test_owned_projects_are_404_for_everyone_else() -> None:
    sender = CapturingEmailSender()
    app = _app(sender)
    async with _client(app) as ada, _client(app) as bob, _client(app) as anon, LifespanManager(ada):
        csrf = await sign_in(ada, sender)
        await sign_in(bob, sender, "bob@example.com")
        files = {"audio": ("a.wav", wav_bytes(), "audio/wav")}
        no_csrf = await ada.post("/api/projects", files=files)
        created = (await ada.post("/api/projects", files=files, headers={"X-CSRF-Token": csrf})).json()
        public = (await anon.post("/api/projects", files=files)).json()
        pid = created["projectId"]
        own = await ada.get(f"/api/projects/{pid}")
        paths = [f"/api/projects/{pid}", f"/api/projects/{pid}/audio", f"/api/projects/{pid}/analysis"]
        other = [(await bob.get(p)).status_code for p in paths] + [(await anon.get(p)).status_code for p in paths]
        director = await anon.post(f"/api/projects/{pid}/director", json={})
        anonymous_project = await bob.get(f"/api/projects/{public['projectId']}")
    assert no_csrf.status_code == 403
    assert own.status_code == 200
    assert other == [404] * 6 and director.status_code == 404
    assert director.json()["error"]["code"] == "PROJECT_NOT_FOUND"
    assert anonymous_project.status_code == 200


async def test_session_exposes_moderator_only_to_a_moderator() -> None:
    sender = CapturingEmailSender()
    app = _app(sender, moderator_emails="Mod@Example.com")
    async with _client(app) as c, LifespanManager(c):
        await sign_in(c, sender, "mod@example.com")
        moderator = (await c.get("/api/auth/session")).json()
    async with _client(_app(sender, moderator_emails="mod@example.com")) as c, LifespanManager(c):
        await sign_in(c, sender, "ada@example.com")
        other = (await c.get("/api/auth/session")).json()
    async with _client(_app(sender)) as c, LifespanManager(c):
        await sign_in(c, sender, "mod@example.com")
        disabled = (await c.get("/api/auth/session")).json()
    assert moderator["moderator"] is True
    assert "moderator" not in other and "moderator" not in disabled
