"""`/api/moderation`: 404 rules, CSRF, 409, audit rows (10-template-moderation requirements 1–3)."""

from typing import Any

from httpx import AsyncClient

from music_world.schemas.store import ModerationQueue
from tests.fakes import CapturingEmailSender
from tests.integration.test_accounts_http import _app, _client, sign_in
from tests.integration.test_http import LifespanManager
from tests.integration.test_templates_http import _create, _h

MOD = "mod@example.com"


async def _hidden_template(ada: AsyncClient, ada_csrf: str, bob: AsyncClient, bob_csrf: str) -> dict[str, Any]:
    created = await _create(ada, ada_csrf, publish=True, name="Ada Night")
    reported = await bob.post(f"/api/templates/{created['id']}/reports", json={"reason": "spam"}, headers=_h(bob_csrf))
    assert reported.status_code == 202
    return created


async def test_routes_do_not_exist_without_moderators_or_for_non_moderators() -> None:
    sender = CapturingEmailSender()
    disabled, enabled = _app(sender), _app(sender, moderator_emails=MOD)
    paths = ["/api/moderation/templates"]
    posts = [f"/api/moderation/templates/{'0' * 8}-0000-0000-0000-{'0' * 12}/{a}" for a in ("restore", "remove")]
    results = []
    async with _client(disabled) as c, LifespanManager(c):
        csrf = await sign_in(c, sender, MOD)  # even the would-be moderator: the list is empty
        results += [(await c.get(p)).status_code for p in paths]
        results += [(await c.post(p, headers=_h(csrf))).status_code for p in posts]
    async with _client(enabled) as anon, _client(enabled) as ada, LifespanManager(anon):
        await sign_in(ada, sender, "ada@example.com")
        for client in (anon, ada):
            results += [(await client.get(p)).status_code for p in paths]
            results += [(await client.post(p)).status_code for p in posts]  # no CSRF header: still 404
    assert set(results) == {404}


async def test_moderator_reviews_restores_and_removes() -> None:
    sender = CapturingEmailSender()
    app = _app(sender, moderator_emails=MOD, template_report_hide_threshold=1)
    async with _client(app) as ada, _client(app) as bob, _client(app) as mod, LifespanManager(ada):
        ada_csrf = await sign_in(ada, sender)
        bob_csrf = await sign_in(bob, sender, "bob@example.com")
        mod_csrf = await sign_in(mod, sender, MOD)
        first = await _hidden_template(ada, ada_csrf, bob, bob_csrf)
        second = await _hidden_template(ada, ada_csrf, bob, bob_csrf)
        queue = (await mod.get("/api/moderation/templates")).json()
        no_csrf = await mod.post(f"/api/moderation/templates/{first['id']}/restore")
        restored = await mod.post(f"/api/moderation/templates/{first['id']}/restore", headers=_h(mod_csrf))
        again = await mod.post(f"/api/moderation/templates/{first['id']}/restore", headers=_h(mod_csrf))
        removed = await mod.post(f"/api/moderation/templates/{second['id']}/remove", headers=_h(mod_csrf))
        gone = await ada.get(f"/api/templates/{second['id']}")
        public = await bob.get(f"/api/templates/{first['id']}")
        empty = (await mod.get("/api/moderation/templates")).json()
        audit = app.state.container.templates.restore._audit  # noqa: SLF001
    ModerationQueue.model_validate(queue)
    assert [i["template"]["id"] for i in queue["items"]] == [second["id"], first["id"]]
    assert queue["items"][0]["reasons"] == ["spam"] and queue["items"][0]["reportCount"] == 1
    assert no_csrf.status_code == 403
    assert (restored.status_code, again.status_code) == (204, 409)
    assert again.json()["error"]["code"] == "TEMPLATE_NOT_HIDDEN"
    assert (removed.status_code, gone.status_code, public.status_code) == (204, 404, 200)
    assert empty == {"items": [], "nextCursor": None}
    assert sorted(a.action for a in audit.actions) == ["remove", "restore"]


async def test_session_of_a_moderator_unlocks_the_queue_and_decisions_are_rate_limited() -> None:
    sender = CapturingEmailSender()
    app = _app(sender, moderator_emails=MOD)
    async with _client(app) as mod, LifespanManager(mod):
        csrf = await sign_in(mod, sender, MOD)
        assert (await mod.get("/api/auth/session")).json()["moderator"] is True
        services = app.state.container.templates
        for _ in range(120):
            services.moderation_limiter.allow(f"user:{(await mod.get('/api/auth/session')).json()['user']['id']}")
        blocked = await mod.post(
            "/api/moderation/templates/00000000-0000-7000-8000-000000000001/remove", headers=_h(csrf)
        )
    assert (blocked.status_code, blocked.json()["error"]["code"]) == (429, "RATE_LIMITED")
