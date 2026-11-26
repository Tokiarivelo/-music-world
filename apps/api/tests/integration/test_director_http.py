"""Director routes end to end with the mock provider (no key, no network)."""

import hashlib
import json
from pathlib import Path
from typing import Any

from httpx import ASGITransport, AsyncClient

from music_world.director.infrastructure.default_template import default_template
from music_world.main import create_app
from music_world.schemas.analysis import AnalysisResult
from music_world.shared.container import Container
from music_world.shared.settings import Settings
from tests.fakes import InMemoryAnalysisRepository, StaticProbe, wav_bytes
from tests.integration.test_http import LifespanManager, make_container
from tests.unit.director.helpers import DEMO_ANALYSIS, FakeProvider, valid_llm_template
from tests.unit.test_analysis_schema import _base


def _client(analyses: InMemoryAnalysisRepository, settings: Settings, **kw: Any) -> AsyncClient:
    def factory(s: Settings) -> Container:
        return make_container(s, StaticProbe("ok"), analyses=analyses, **kw)

    app = create_app(settings, factory)
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _demo_body(provider: str | None = None) -> dict[str, Any]:
    return {"analysis": json.loads(DEMO_ANALYSIS.read_text()), "provider": provider}


async def test_providers_lists_mock_as_default_without_keys() -> None:
    c = _client(InMemoryAnalysisRepository(), Settings(app_env="test"))
    async with c, LifespanManager(c):
        body = (await c.get("/api/director/providers")).json()
    assert body["default"] == "mock"
    assert {p["id"]: p["configured"] for p in body["providers"]} == {"muse": False, "bedrock": False, "mock": True}
    assert "key" not in json.dumps(body).lower()


async def test_demo_route_generates_with_mock_and_reports_the_fallback() -> None:
    c = _client(InMemoryAnalysisRepository(), Settings(app_env="test"))
    async with c, LifespanManager(c):
        response = await c.post("/api/director/demo", json=_demo_body("muse"))
        assert response.status_code == 200, response.text
        body = response.json()
        again = (await c.post("/api/director/demo", json=_demo_body("muse"))).json()
    assert body["provider"] == "mock" and body["requestedProvider"] == "muse"
    assert body["fallbacks"] == [{"provider": "muse", "reason": "NOT_CONFIGURED"}]
    assert body["template"]["meta"]["generatedBy"]["provider"] == "mock" and not body["cached"]
    assert again["cached"] and again["template"] == body["template"]


async def test_demo_route_rejects_another_song() -> None:
    c = _client(InMemoryAnalysisRepository(), Settings(app_env="test"))
    async with c, LifespanManager(c):
        response = await c.post("/api/director/demo", json={"analysis": _base()})
    assert (response.status_code, response.json()["error"]["code"]) == (422, "DEMO_ANALYSIS_MISMATCH")


async def test_project_route_uses_the_selected_provider() -> None:
    analyses = InMemoryAnalysisRepository()
    audio = wav_bytes()
    await analyses.save(
        AnalysisResult.model_validate({**_base(), "audioHash": "sha256:" + hashlib.sha256(audio).hexdigest()})
    )
    muse = FakeProvider("muse", [valid_llm_template()], model="muse-spark-1.3-contributor")
    c = _client(analyses, Settings(app_env="test"), providers={"muse": muse})
    async with c, LifespanManager(c):
        created = (await c.post("/api/projects", files={"audio": ("a.wav", audio, "audio/wav")})).json()
        response = await c.post(f"/api/projects/{created['projectId']}/director", json={})
        providers = (await c.get("/api/director/providers")).json()
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["provider"], body["model"], body["fallbacks"]) == ("muse", "muse-spark-1.3-contributor", [])
    assert body["template"]["name"] == "Midnight Glass"
    assert providers["default"] == "muse"


async def test_project_route_errors() -> None:
    analyses = InMemoryAnalysisRepository()
    c = _client(analyses, Settings(app_env="test"))
    async with c, LifespanManager(c):
        missing = await c.post("/api/projects/not-a-uuid/director", json={})
        unknown = await c.post("/api/projects/00000000-0000-7000-8000-000000000999/director", json={})
        created = (await c.post("/api/projects", files={"audio": ("a.wav", wav_bytes(), "audio/wav")})).json()
        pending = await c.post(f"/api/projects/{created['projectId']}/director", json={})
        bad = await c.post(f"/api/projects/{created['projectId']}/director", json={"provider": "gpt"})
    assert missing.status_code == 404 and unknown.status_code == 404
    assert (pending.status_code, pending.json()["error"]["code"]) == (409, "ANALYSIS_NOT_READY")
    assert bad.status_code == 422


async def test_rate_limit_answers_429() -> None:
    c = _client(InMemoryAnalysisRepository(), Settings(app_env="test", director_rate_limit_per_hour=2))
    async with c, LifespanManager(c):
        codes = [(await c.post("/api/director/demo", json=_demo_body())).status_code for _ in range(3)]
        last = await c.post("/api/director/demo", json=_demo_body())
    assert codes == [200, 200, 429] and last.json()["error"]["code"] == "RATE_LIMITED"


async def test_layout_route_writes_a_layout_for_the_chosen_template() -> None:
    analyses = InMemoryAnalysisRepository()
    audio = wav_bytes()
    await analyses.save(
        AnalysisResult.model_validate({**_base(), "audioHash": "sha256:" + hashlib.sha256(audio).hexdigest()})
    )
    realm = json.loads(
        (Path(__file__).parents[2] / "music_world/templates/infrastructure/featured/enchanted-realm.json").read_text()
    )
    c = _client(analyses, Settings(app_env="test"))
    async with c, LifespanManager(c):
        created = (await c.post("/api/projects", files={"audio": ("a.wav", audio, "audio/wav")})).json()
        response = await c.post(f"/api/projects/{created['projectId']}/layout", json={"template": realm})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["provider"] == "mock"
    assert body["layout"]["patches"][0]["theme"] == "keep"
    assert any(step["kind"] == "recipe:magic_tree" for step in body["layout"]["sequence"])


async def test_demo_layout_route_writes_a_city_mix_and_rejects_another_song() -> None:
    c = _client(InMemoryAnalysisRepository(), Settings(app_env="test"))
    body = {**_demo_body(), "template": default_template()}
    async with c, LifespanManager(c):
        ok = await c.post("/api/director/layout/demo", json=body)
        other = _demo_body()
        other["analysis"]["audioHash"] = "sha256:" + "0" * 64
        bad = await c.post("/api/director/layout/demo", json={**other, "template": default_template()})
    assert ok.status_code == 200, ok.text
    layout = ok.json()["layout"]
    assert layout["patches"] == [] and {s["kind"] for s in layout["sequence"]} >= {"building"}
    assert bad.status_code in (400, 409, 422)
