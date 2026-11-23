"""`POST /api/projects` and `GET /api/projects/{id}`: status codes and the uniform error body."""

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from music_world.main import create_app
from music_world.projects.domain.errors import AudioUnreadableError
from music_world.projects.domain.project import MAX_AUDIO_BYTES
from music_world.shared.settings import Settings
from tests.fakes import FakeAudioProbe, StaticProbe, wav_bytes
from tests.integration.test_http import LifespanManager, make_container


async def _client(probe: FakeAudioProbe | None = None) -> AsyncClient:
    settings = Settings(app_env="test")
    app = create_app(settings, lambda s: make_container(s, StaticProbe("ok"), probe))
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    c = await _client()
    async with c, LifespanManager(c):
        yield c


async def test_upload_is_accepted_and_the_project_is_readable(client: AsyncClient) -> None:
    files = {"audio": ("song.mp3", wav_bytes(), "audio/mpeg"), "lyrics": ("song.lrc", b"[00:00.50]hi", "text/plain")}
    accepted = await client.post("/api/projects", files=files)
    assert accepted.status_code == 202, accepted.text
    body = accepted.json()
    assert body["status"] == "analyzing" and body["jobId"]
    project = (await client.get(f"/api/projects/{body['projectId']}")).json()
    assert project["status"] == "analyzing" and project["hasLyricsFile"] is True
    assert project["job"]["id"] == body["jobId"] and project["audioHash"].startswith("sha256:")


async def test_same_audio_twice_creates_two_projects_with_one_hash(client: AsyncClient) -> None:
    files = {"audio": ("a.wav", wav_bytes(), "audio/wav")}
    a = (await client.post("/api/projects", files=files)).json()
    b = (await client.post("/api/projects", files=files)).json()
    pa = (await client.get(f"/api/projects/{a['projectId']}")).json()
    pb = (await client.get(f"/api/projects/{b['projectId']}")).json()
    assert a["projectId"] != b["projectId"] and pa["audioHash"] == pb["audioHash"]


@pytest.mark.parametrize(
    ("content", "probe", "status", "code"),
    [
        (b"OggS" + b"\x00" * 64, None, 415, "AUDIO_FORMAT_UNSUPPORTED"),
        (wav_bytes(), FakeAudioProbe(240.0), 422, "AUDIO_TOO_LONG"),
        (wav_bytes(), FakeAudioProbe(AudioUnreadableError("audio file could not be read")), 422, "AUDIO_UNREADABLE"),
        (b"RIFF" + b"\x00" * (MAX_AUDIO_BYTES + 1), None, 413, "AUDIO_TOO_LARGE"),
    ],
)
async def test_invalid_uploads_are_rejected_with_a_clear_error(
    content: bytes, probe: FakeAudioProbe | None, status: int, code: str
) -> None:
    c = await _client(probe)
    async with c, LifespanManager(c):
        response = await c.post("/api/projects", files={"audio": ("x.wav", content, "audio/wav")})
    assert response.status_code == status
    assert response.json()["error"]["code"] == code


async def test_invalid_lrc_and_missing_audio_are_422(client: AsyncClient) -> None:
    bad_lrc = await client.post(
        "/api/projects", files={"audio": ("a.wav", wav_bytes(), "audio/wav"), "lyrics": ("l.lrc", b"\xff\xfe\x00", "x")}
    )
    assert (bad_lrc.status_code, bad_lrc.json()["error"]["code"]) == (422, "LRC_INVALID")
    missing = await client.post("/api/projects", files={"other": ("a.wav", wav_bytes(), "audio/wav")})
    assert (missing.status_code, missing.json()["error"]["code"]) == (422, "REQUEST_INVALID")


async def test_unknown_or_malformed_project_id_is_404(client: AsyncClient) -> None:
    for pid in ("00000000-0000-7000-8000-000000000999", "not-a-uuid"):
        response = await client.get(f"/api/projects/{pid}")
        assert (response.status_code, response.json()["error"]["code"]) == (404, "PROJECT_NOT_FOUND")
