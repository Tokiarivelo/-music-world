from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from music_world.analysis.application.use_cases.analysis_cache import AnalysisCache
from music_world.analysis.application.use_cases.get_project_analysis import GetProjectAnalysis
from music_world.analysis.infrastructure.project_audio_source import ProjectsAudioSource
from music_world.director.application.ports import LLMProvider
from music_world.director.domain.providers import ProviderId
from music_world.main import create_app
from music_world.projects.application.use_cases.check_project_access import CheckProjectAccess
from music_world.projects.application.use_cases.create_project import CreateProject
from music_world.projects.application.use_cases.enqueue_job import EnqueueJob
from music_world.projects.application.use_cases.get_job import GetJob
from music_world.projects.application.use_cases.get_project import GetProject
from music_world.projects.application.use_cases.get_project_audio import GetProjectAudio
from music_world.projects.application.use_cases.run_job import RunJob
from music_world.projects.domain.job_kinds import ANALYZE_PROJECT_JOB_KIND
from music_world.shared.container import Container, build_accounts, build_director, build_templates
from music_world.shared.rate_limit import SlidingWindowLimiter
from music_world.shared.settings import Settings
from music_world.system.application.use_cases.check_health import CheckHealth
from tests.fakes import (
    CapturingEmailSender,
    FakeAudioProbe,
    FakeClock,
    InMemoryAnalysisRepository,
    InMemoryJobRepository,
    InMemoryLoginTokenRepository,
    InMemoryObjectStore,
    InMemoryProjectRepository,
    InMemoryReportRepository,
    InMemorySessionRepository,
    InMemoryStoreTemplateRepository,
    InMemoryUserRepository,
    RecordingQueue,
    SequentialIds,
    StaticProbe,
)

SECRET = "super-secret-key-value"


def make_container(
    settings: Settings,
    postgres: StaticProbe,
    probe: FakeAudioProbe | None = None,
    analyses: InMemoryAnalysisRepository | None = None,
    providers: dict[ProviderId, LLMProvider] | None = None,
    sender: CapturingEmailSender | None = None,
) -> Container:
    repo, clock, ids = InMemoryJobRepository(), FakeClock(), SequentialIds()
    projects = InMemoryProjectRepository()
    analysis_repo = analyses if analyses is not None else InMemoryAnalysisRepository()
    cache = AnalysisCache(analysis_repo)
    get_project = GetProject(projects, repo, cache)
    store = InMemoryObjectStore()
    analysis = GetProjectAnalysis(ProjectsAudioSource(get_project), analysis_repo)
    enqueue = EnqueueJob(repo, RecordingQueue(), {"demo", ANALYZE_PROJECT_JOB_KIND}, ids, clock)
    return Container(
        settings=settings,
        enqueue_job=enqueue,
        get_job=GetJob(repo),
        run_job=RunJob(repo, {}, clock),
        check_health=CheckHealth(settings.app_version, postgres, StaticProbe("ok"), StaticProbe("not_configured")),
        create_project=CreateProject(projects, store, probe or FakeAudioProbe(), cache, enqueue, ids, clock),
        get_project=get_project,
        analysis_cache=cache,
        get_project_analysis=analysis,
        get_project_audio=GetProjectAudio(projects, store),
        director=build_director(settings, store, analysis, providers),
        accounts=build_accounts(
            settings,
            InMemoryUserRepository(),
            InMemoryLoginTokenRepository(),
            InMemorySessionRepository(),
            sender or CapturingEmailSender(),
        ),
        templates=build_templates(settings, InMemoryStoreTemplateRepository(), store, InMemoryReportRepository()),
        upload_limiter=SlidingWindowLimiter(settings.upload_rate_limit_per_hour, 3600.0),
        check_project_access=CheckProjectAccess(projects),
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
