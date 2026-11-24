"""`GET /api/projects/{id}/analysis` and the `analyze_project` job end to end with fake stages."""

import hashlib

from httpx import ASGITransport, AsyncClient

from music_world.analysis.application.use_cases.analyze_audio import AnalyzeAudio
from music_world.analysis.interfaces.jobs import AnalyzeProjectJobHandler
from music_world.main import create_app
from music_world.projects.application.use_cases.run_job import RunJob
from music_world.projects.domain.job_kinds import ANALYZE_PROJECT_JOB_KIND
from music_world.schemas.analysis import AnalysisResult
from music_world.shared.container import Container
from music_world.shared.settings import Settings
from tests.fakes import FakeClock, InMemoryAnalysisRepository, StaticProbe, wav_bytes
from tests.integration.test_http import LifespanManager, make_container
from tests.unit.analysis.test_analyze_audio import (
    FakeDecoder,
    FakeRhythm,
    FakeSeparator,
    FakeStructure,
    FakeTranscriber,
    NoLyrics,
)
from tests.unit.test_analysis_schema import _base


def _client(analyses: InMemoryAnalysisRepository, hold: list[Container]) -> AsyncClient:
    def factory(s: Settings) -> Container:
        container = make_container(s, StaticProbe("ok"), analyses=analyses)
        hold.append(container)
        return container

    app = create_app(Settings(app_env="test"), factory)
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_cached_audio_is_ready_immediately_and_its_analysis_is_served() -> None:
    analyses, hold = InMemoryAnalysisRepository(), []
    audio = wav_bytes()
    doc = {**_base(), "audioHash": "sha256:" + hashlib.sha256(audio).hexdigest()}
    await analyses.save(AnalysisResult.model_validate(doc))
    c = _client(analyses, hold)
    async with c, LifespanManager(c):
        created = (await c.post("/api/projects", files={"audio": ("a.wav", audio, "audio/wav")})).json()
        assert created["status"] == "ready" and created["jobId"] is None
        response = await c.get(f"/api/projects/{created['projectId']}/analysis")
    assert response.status_code == 200
    body = response.json()
    assert body["schema"] == "music-world.analysis.v1" and body["notes"][0]["chordId"] == "c_0"


async def test_analysis_is_409_until_the_job_has_run_then_200() -> None:
    analyses, hold = InMemoryAnalysisRepository(), []
    c = _client(analyses, hold)
    async with c, LifespanManager(c):
        created = (await c.post("/api/projects", files={"audio": ("a.wav", wav_bytes(), "audio/wav")})).json()
        pending = await c.get(f"/api/projects/{created['projectId']}/analysis")
        assert (pending.status_code, pending.json()["error"]["code"]) == (409, "ANALYSIS_NOT_READY")

        # Run the queued job in-process with fake stages (what the worker does).
        container = hold[0]
        store = container.create_project._store  # the in-memory store the upload went to
        analyze = AnalyzeAudio(
            analyses, store, FakeDecoder(), FakeSeparator(), FakeTranscriber(), FakeRhythm(), FakeStructure(),
            NoLyrics(), min_velocity=0.25,
        )  # fmt: skip
        handler = AnalyzeProjectJobHandler(container.get_project_analysis._projects, analyze)
        jobs = container.get_job._repo
        job = await RunJob(jobs, {ANALYZE_PROJECT_JOB_KIND: handler}, FakeClock()).execute(created["jobId"])
        assert job.status.value == "done" and job.stage == "store"

        project = (await c.get(f"/api/projects/{created['projectId']}")).json()
        ready = await c.get(f"/api/projects/{created['projectId']}/analysis")
    assert project["status"] == "ready" and project["job"]["progress"] == 1
    assert ready.status_code == 200 and ready.json()["key"] == "C major"


async def test_unknown_project_analysis_is_404() -> None:
    c = _client(InMemoryAnalysisRepository(), [])
    async with c, LifespanManager(c):
        for pid in ("00000000-0000-7000-8000-000000000999", "nope"):
            response = await c.get(f"/api/projects/{pid}/analysis")
            assert (response.status_code, response.json()["error"]["code"]) == (404, "PROJECT_NOT_FOUND")


async def test_lyrics_search_is_409_before_the_analysis_and_queues_a_job_after() -> None:
    analyses, hold = InMemoryAnalysisRepository(), []
    audio = wav_bytes()
    c = _client(analyses, hold)
    async with c, LifespanManager(c):
        created = (await c.post("/api/projects", files={"audio": ("a.wav", audio, "audio/wav")})).json()
        early = await c.post(f"/api/projects/{created['projectId']}/lyrics-search")
        assert (early.status_code, early.json()["error"]["code"]) == (409, "ANALYSIS_NOT_READY")
        await analyses.save(
            AnalysisResult.model_validate({**_base(), "audioHash": "sha256:" + hashlib.sha256(audio).hexdigest()})
        )
        queued = await c.post(f"/api/projects/{created['projectId']}/lyrics-search")
        missing = await c.post("/api/projects/00000000-0000-7000-8000-000000000000/lyrics-search")
    assert queued.status_code == 202 and queued.json()["jobId"] and queued.json()["projectId"] == created["projectId"]
    assert missing.status_code == 404
