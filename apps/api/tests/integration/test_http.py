from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from music_world.analysis.application.use_cases.analysis_cache import AnalysisCache
from music_world.main import create_app
from music_world.projects.application.use_cases.create_project import CreateProject
from music_world.projects.application.use_cases.enqueue_job import EnqueueJob
from music_world.projects.application.use_cases.get_job import GetJob
from music_world.projects.application.use_cases.get_project import GetProject
from music_world.projects.application.use_cases.run_job import RunJob
from music_world.projects.domain.job_kinds import ANALYZE_PROJECT_JOB_KIND
from music_world.shared.container import Container
from music_world.shared.settings import Settings
from music_world.system.application.use_cases.check_health import CheckHealth
from tests.fakes import (
    FakeAudioProbe,
    FakeClock,
    InMemoryAnalysisRepository,
    InMemoryJobRepository,
    InMemoryObjectStore,
    InMemoryProjectRepository,
    RecordingQueue,
    SequentialIds,
    StaticProbe,
)

SECRET = "super-secret-key-value"


def make_container(
    settings: Settings,
    postgres: StaticProbe,
    probe: FakeAudioProbe | None = None,
    analyses: AnalysisCache | None = None,
) -> Container:
    repo, clock, ids = InMemoryJobRepository(), FakeClock(), SequentialIds()
    projects = InMemoryProjectRepository()
    cache = analyses or AnalysisCache(InMemoryAnalysisRepository())
    enqueue = EnqueueJob(repo, RecordingQueue(), {"demo", ANALYZE_PROJECT_JOB_KIND}, ids, clock)
    return Container(
        settings=settings,
        enqueue_job=enqueue,
        get_job=GetJob(repo),
        run_job=RunJob(repo, {}, clock),
        check_health=CheckHealth(settings.app_version, postgres, StaticProbe("ok"), StaticProbe("not_configured")),
        create_project=CreateProject(
            projects, InMemoryObjectStore(), probe or FakeAudioProbe(), cache, enqueue, ids, clock
        ),
        get_project=GetProject(projects, repo, cache),
        analysis_cache=cache,
    )


async def client_for(env: str, postgres: StaticProbe | None = None) -> AsyncClient:
    settings = Settings(app_env=env, s3_secret_key=SECRET)  # type: ignore[arg-type]
    app = create_app(settings, lambda s: make_container(s, postgres or StaticProbe("ok")))
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    app_client = await client_for("development")
    async with app_client, LifespanManager(app_client):
        yield app_client


class LifespanManager:
    """Runs the FastAPI lifespan (httpx's ASGITransport does not)."""

    def __init__(self, client: AsyncClient) -> None:
        self.app = client._transport.app  # type: ignore[attr-defined]
        self.cm = self.app.router.lifespan_context(self.app)

    async def __aenter__(self) -> None:
        await self.cm.__aenter__()

    async def __aexit__(self, *exc: object) -> None:
        await self.cm.__aexit__(*exc)


async def test_health_reports_dependencies_and_no_secret(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["checks"] == {"postgres": "ok", "redis": "ok", "storage": "not_configured"}
    assert SECRET not in response.text


async def test_ready_is_503_when_a_dependency_fails() -> None:
    c = await client_for("development", StaticProbe(ConnectionError("down")))
    async with c, LifespanManager(c):
        health, ready = await c.get("/api/health"), await c.get("/api/ready")
    assert (health.status_code, health.json()["status"]) == (200, "degraded")
    assert ready.status_code == 503


async def test_demo_job_is_accepted_then_readable_in_camel_case(client: AsyncClient) -> None:
    accepted = await client.post("/api/jobs/demo")
    assert accepted.status_code == 202
    job_id = accepted.json()["jobId"]
    job = (await client.get(f"/api/jobs/{job_id}")).json()
    assert job["status"] == "queued" and job["progress"] == 0 and "createdAt" in job


async def test_unknown_job_uses_the_uniform_error_body(client: AsyncClient) -> None:
    response = await client.get("/api/jobs/unknown")
    assert response.status_code == 404
    assert response.json() == {"error": {"code": "JOB_NOT_FOUND", "message": "job unknown not found", "details": []}}


async def test_demo_route_and_docs_are_disabled_in_production() -> None:
    c = await client_for("production")
    async with c, LifespanManager(c):
        assert (await c.post("/api/jobs/demo")).status_code in (404, 405)
        assert (await c.get("/api/docs")).status_code == 404
