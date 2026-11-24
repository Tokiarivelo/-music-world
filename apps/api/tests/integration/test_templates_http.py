"""`/api/templates`: publish, ownership 404, thumbnail, public gallery (06-template-store requirements 3, 4)."""

from typing import Any

from httpx import AsyncClient

from music_world.schemas.store import StoreTemplate
from tests.fakes import CapturingEmailSender, wav_bytes
from tests.integration.test_accounts_http import _app, _client, sign_in
from tests.integration.test_http import LifespanManager
from tests.unit.templates.helpers import jpeg, png, template


def _h(csrf: str) -> dict[str, str]:
    return {"X-CSRF-Token": csrf}


async def _create(c: AsyncClient, csrf: str, publish: bool = False, **changes: Any) -> dict[str, Any]:
    response = await c.post(
        "/api/templates", json={"template": template(**changes), "publish": publish}, headers=_h(csrf)
    )
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


async def test_publish_flow_between_two_users() -> None:
    sender = CapturingEmailSender()
    app = _app(sender)
    async with _client(app) as ada, _client(app) as bob, _client(app) as anon, LifespanManager(ada):
        unsigned = await anon.post("/api/templates", json={"template": template()})
        csrf = await sign_in(ada, sender)
        bob_csrf = await sign_in(bob, sender, "bob@example.com")
        no_csrf = await ada.post("/api/templates", json={"template": template()})
        draft = await _create(ada, csrf, name="Ada Night")
        hidden = [(await c.get(f"/api/templates/{draft['id']}")).status_code for c in (bob, anon)]
        gallery_before = (await anon.get("/api/templates")).json()
        steal = await bob.post(f"/api/templates/{draft['id']}/publish", headers=_h(bob_csrf))
        published = await ada.post(f"/api/templates/{draft['id']}/publish", headers=_h(csrf))
        seen = await anon.get(f"/api/templates/{draft['id']}")
        gallery = (await anon.get("/api/templates")).json()
        mine = (await ada.get("/api/templates/mine")).json()
        bob_delete = await bob.delete(f"/api/templates/{draft['id']}", headers=_h(bob_csrf))
        deleted = await ada.delete(f"/api/templates/{draft['id']}", headers=_h(csrf))
        gone = await anon.get(f"/api/templates/{draft['id']}")
    assert (unsigned.status_code, unsigned.json()["error"]["code"]) == (401, "AUTH_REQUIRED")
    assert no_csrf.status_code == 403
    StoreTemplate.model_validate(draft)
    assert draft["status"] == "draft" and draft["author"] == {"displayName": draft["author"]["displayName"]}
    assert draft["author"]["displayName"].startswith("creator-") and "example.com" not in str(draft)
    assert hidden == [404, 404] and draft["id"] not in [t["id"] for t in gallery_before["items"]]
    assert (steal.status_code, steal.json()["error"]["code"]) == (404, "TEMPLATE_NOT_FOUND")
    assert published.json()["status"] == "published" and seen.status_code == 200
    assert seen.json()["template"]["name"] == "Ada Night"
    assert draft["id"] in [t["id"] for t in gallery["items"]] and gallery["nextCursor"] is None
    assert [t["id"] for t in mine["items"]] == [draft["id"]]
    assert bob_delete.status_code == 404 and deleted.status_code == 204 and gone.status_code == 404


async def test_invalid_template_and_ids() -> None:
    sender = CapturingEmailSender()
    async with _client(_app(sender)) as c, LifespanManager(c):
        csrf = await sign_in(c, sender)
        bad = await c.post("/api/templates", json={"template": template(name="see https://x.y")}, headers=_h(csrf))
        recipe = await c.post(
            "/api/templates",
            json={"template": template(mappings=[{"when": {}, "spawn": "recipe:x"}])},
            headers=_h(csrf),
        )
        not_uuid = await c.get("/api/templates/neon-nocturne")
        unknown = await c.get("/api/templates/00000000-0000-7000-8000-000000000999")
        big = await c.post("/api/templates", json={"template": template(name="x" * 70_000)}, headers=_h(csrf))
    assert (bad.status_code, bad.json()["error"]["code"]) == (422, "TEMPLATE_INVALID")
    assert bad.json()["error"]["details"][0]["loc"] == ["template", "name"]
    assert recipe.status_code == 422
    assert not_uuid.status_code == 404 and unknown.status_code == 404
    assert big.status_code == 422


async def test_thumbnail_upload_and_download() -> None:
    sender = CapturingEmailSender()
    async with _client(_app(sender)) as c, _client(c._transport.app) as anon, LifespanManager(c):  # type: ignore[attr-defined]
        csrf = await sign_in(c, sender)
        created = await _create(c, csrf, publish=True)
        url = f"/api/templates/{created['id']}/thumbnail"
        svg = await c.put(url, files={"image": ("t.png", b"<svg onload=alert(1)>", "image/png")}, headers=_h(csrf))
        huge = await c.put(url, files={"image": ("t.png", png(pad=200_000), "image/png")}, headers=_h(csrf))
        wide = await c.put(url, files={"image": ("t.jpg", jpeg(width=2000), "image/jpeg")}, headers=_h(csrf))
        ok = await c.put(url, files={"image": ("evil.html", png(), "text/html")}, headers=_h(csrf))
        thumb_url = ok.json()["thumbnailUrl"]
        image = await anon.get(thumb_url)
    assert (svg.status_code, huge.status_code, wide.status_code) == (415, 413, 422)
    assert ok.status_code == 200 and thumb_url.startswith(f"/api/templates/{created['id']}/thumbnail?v=")
    assert image.status_code == 200 and image.content == png()
    assert image.headers["content-type"] == "image/png" and image.headers["x-content-type-options"] == "nosniff"


async def test_publication_is_rate_limited_per_user() -> None:
    sender = CapturingEmailSender()
    async with _client(_app(sender, template_publish_rate_limit_per_hour=2)) as c, LifespanManager(c):
        csrf = await sign_in(c, sender)
        codes = [
            (await c.post("/api/templates", json={"template": template()}, headers=_h(csrf))).status_code
            for _ in range(3)
        ]
    assert codes == [201, 201, 429]


async def test_reports_hide_a_template_and_uploads_are_rate_limited() -> None:
    sender = CapturingEmailSender()
    app = _app(sender, template_report_hide_threshold=1, upload_rate_limit_per_hour=1)
    async with _client(app) as ada, _client(app) as bob, _client(app) as anon, LifespanManager(ada):
        csrf = await sign_in(ada, sender)
        bob_csrf = await sign_in(bob, sender, "bob@example.com")
        created = await _create(ada, csrf, publish=True)
        url = f"/api/templates/{created['id']}/reports"
        own = await ada.post(url, json={"reason": "spam"}, headers=_h(csrf))
        bad = await bob.post(url, json={"reason": "boring"}, headers=_h(bob_csrf))
        anonymous = await anon.post(url, json={"reason": "spam"})
        reported = await bob.post(url, json={"reason": "offensive"}, headers=_h(bob_csrf))
        gallery = (await anon.get("/api/templates")).json()
        owner_view = await ada.get(f"/api/templates/{created['id']}")
        files = {"audio": ("a.wav", wav_bytes(), "audio/wav")}
        uploads = [(await anon.post("/api/projects", files=files)).status_code for _ in range(2)]
    assert (own.status_code, own.json()["error"]["code"]) == (409, "TEMPLATE_NOT_REPORTABLE")
    assert bad.status_code == 422 and anonymous.status_code == 401
    assert (reported.status_code, reported.json()) == (202, {"status": "received"})
    assert created["id"] not in [t["id"] for t in gallery["items"]]
    assert owner_view.json()["status"] == "hidden"
    assert uploads == [202, 429]


async def test_update_draft_owner_only_and_draft_only() -> None:
    sender = CapturingEmailSender()
    app = _app(sender)
    async with _client(app) as ada, _client(app) as bob, _client(app) as anon, LifespanManager(ada):
        csrf = await sign_in(ada, sender)
        bob_csrf = await sign_in(bob, sender, "bob@example.com")
        draft = await _create(ada, csrf, name="Ada Night")
        url = f"/api/templates/{draft['id']}"
        unsigned = await anon.put(url, json={"template": template()})
        no_csrf = await ada.put(url, json={"template": template()})
        stolen = await bob.put(url, json={"template": template()}, headers=_h(bob_csrf))
        invalid = await ada.put(url, json={"template": template(name="see https://x.y")}, headers=_h(csrf))
        updated = await ada.put(url, json={"template": template(name="Ada Dawn")}, headers=_h(csrf))
        reread = await ada.get(url)
        await ada.post(f"{url}/publish", headers=_h(csrf))
        frozen = await ada.put(url, json={"template": template(name="Late")}, headers=_h(csrf))
        after = await ada.get(url)
    assert unsigned.status_code == 401 and no_csrf.status_code == 403
    assert (stolen.status_code, stolen.json()["error"]["code"]) == (404, "TEMPLATE_NOT_FOUND")
    assert (invalid.status_code, invalid.json()["error"]["code"]) == (422, "TEMPLATE_INVALID")
    assert invalid.json()["error"]["details"][0]["loc"] == ["template", "name"]
    StoreTemplate.model_validate(updated.json())
    assert updated.status_code == 200 and updated.json()["id"] == draft["id"] and updated.json()["status"] == "draft"
    assert reread.json()["template"]["name"] == "Ada Dawn"
    assert reread.json()["template"]["id"].endswith(draft["template"]["id"][-8:])
    assert (frozen.status_code, frozen.json()["error"]["code"]) == (409, "TEMPLATE_NOT_EDITABLE")
    assert after.json()["template"]["name"] == "Ada Dawn"
