"""`/api/projects/{id}/edits`: owner only, schema-validated, at most 64 KB (11-editable-notes task 7)."""

from httpx import AsyncClient

from music_world.projects.application.use_cases.project_edits import MAX_EDITS_BYTES
from tests.fakes import CapturingEmailSender, wav_bytes
from tests.integration.test_accounts_http import _app, _client, sign_in
from tests.integration.test_http import LifespanManager

EDITS = {
    "version": 1,
    "lines": [
        {
            "id": "line-1",
            "name": "Harmony",
            "color": "#00ff88",
            "clef": "treble",
            "height": 1,
            "muted": False,
            "solo": False,
            "order": 1,
        }
    ],
    "notes": [{"noteId": "n1", "midi": 72, "lineId": "line-1"}],
    "added": [{"id": "user:1", "time": 2.5, "duration": 0.5, "midi": 60, "velocity": 0.7, "lineId": "main"}],
}


async def _upload(client: AsyncClient, csrf: str | None = None) -> str:
    headers = {"X-CSRF-Token": csrf} if csrf else {}
    created = await client.post("/api/projects", files={"audio": ("a.wav", wav_bytes(), "audio/wav")}, headers=headers)
    assert created.status_code == 202, created.text
    return str(created.json()["projectId"])


async def test_owner_saves_and_reads_back_edits_and_others_get_404() -> None:
    sender = CapturingEmailSender()
    app = _app(sender)
    async with _client(app) as ada, _client(app) as bob, _client(app) as anon, LifespanManager(ada):
        csrf = await sign_in(ada, sender)
        bob_csrf = await sign_in(bob, sender, "bob@example.com")
        pid = await _upload(ada, csrf)
        url = f"/api/projects/{pid}/edits"

        assert (await ada.get(url)).json() == {"version": 1, "lines": [], "notes": [], "added": []}
        saved = await ada.put(url, json=EDITS, headers={"X-CSRF-Token": csrf})
        assert saved.status_code == 200, saved.text
        assert (await ada.get(url)).json() == EDITS

        assert (await anon.get(url)).status_code == 401
        assert (await bob.get(url)).status_code == 404
        assert (await bob.put(url, json=EDITS, headers={"X-CSRF-Token": bob_csrf})).status_code == 404
        assert (await ada.get("/api/projects/not-a-project/edits")).status_code == 404


async def test_a_project_without_an_owner_has_no_server_edits() -> None:
    sender = CapturingEmailSender()
    app = _app(sender)
    async with _client(app) as anon, _client(app) as ada, LifespanManager(anon):
        pid = await _upload(anon)
        csrf = await sign_in(ada, sender)
        assert (
            await ada.put(f"/api/projects/{pid}/edits", json=EDITS, headers={"X-CSRF-Token": csrf})
        ).status_code == 404


async def test_invalid_and_oversized_edits_are_rejected() -> None:
    sender = CapturingEmailSender()
    app = _app(sender)
    async with _client(app) as ada, LifespanManager(ada):
        csrf = await sign_in(ada, sender)
        pid = await _upload(ada, csrf)
        url, headers = f"/api/projects/{pid}/edits", {"X-CSRF-Token": csrf}
        bad_color = {**EDITS, "notes": [{"noteId": "n1", "color": "red"}]}
        assert (await ada.put(url, json=bad_color, headers=headers)).status_code == 422
        unknown = {**EDITS, "surprise": 1}
        assert (await ada.put(url, json=unknown, headers=headers)).status_code == 422
        assert (await ada.put(url, json=EDITS)).status_code == 403  # no CSRF token
        long_id = "x" * 64
        big = {**EDITS, "notes": [{"noteId": f"{long_id}{i}"[:64], "midi": 60, "lineId": "main"} for i in range(2000)]}
        too_big = await ada.put(url, json=big, headers=headers)
        assert too_big.status_code == 413, too_big.text
        assert too_big.json()["error"]["code"] == "EDITS_TOO_LARGE"
        assert MAX_EDITS_BYTES == 64 * 1024
