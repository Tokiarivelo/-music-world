"""Composition root: the only place where ports are bound to adapters."""

from dataclasses import dataclass, field

from arq.connections import ArqRedis
from sqlalchemy.ext.asyncio import AsyncEngine

from music_world.analysis.application.use_cases.analysis_cache import AnalysisCache
from music_world.analysis.infrastructure.sqlalchemy_analysis_repository import SqlAlchemyAnalysisRepository
from music_world.projects.application.ports import JobHandler
from music_world.projects.application.use_cases.create_project import CreateProject
from music_world.projects.application.use_cases.enqueue_job import EnqueueJob
from music_world.projects.application.use_cases.get_job import GetJob
from music_world.projects.application.use_cases.get_project import GetProject
from music_world.projects.application.use_cases.run_job import RunJob
from music_world.projects.domain.job_kinds import ANALYZE_PROJECT_JOB_KIND, DEMO_JOB_KIND
from music_world.projects.infrastructure.arq_job_queue import ArqJobQueue
from music_world.projects.infrastructure.demo_job_handler import DemoJobHandler
from music_world.projects.infrastructure.ffprobe_audio_probe import FfprobeAudioProbe
from music_world.projects.infrastructure.sqlalchemy_job_repository import SqlAlchemyJobRepository
from music_world.projects.infrastructure.sqlalchemy_project_repository import SqlAlchemyProjectRepository
from music_world.shared.clock import utc_now
from music_world.shared.db import create_engine, create_session_factory
from music_world.shared.ids import uuid7
from music_world.shared.object_store import build_object_store
from music_world.shared.settings import Settings
from music_world.system.application.use_cases.check_health import CheckHealth
from music_world.system.infrastructure.probes import PostgresProbe, RedisProbe, S3Probe


@dataclass
class Container:
    settings: Settings
    enqueue_job: EnqueueJob
    get_job: GetJob
    run_job: RunJob
    check_health: CheckHealth
    create_project: CreateProject
    get_project: GetProject
    analysis_cache: AnalysisCache
    engine: AsyncEngine | None = None
    redis: ArqRedis | None = None
    handlers: dict[str, JobHandler] = field(default_factory=dict)

    async def close(self) -> None:
        if self.redis is not None:
            await self.redis.aclose()
        if self.engine is not None:
            await self.engine.dispose()


def build_container(settings: Settings) -> Container:
    """Builds adapters lazily: no connection is opened until first use, so the API starts even if a
    dependency is down (and /api/health reports it)."""
    engine = create_engine(settings.database_url)
    sessions = create_session_factory(engine)
    redis = ArqRedis.from_url(settings.redis_url)
    repo = SqlAlchemyJobRepository(sessions)
    projects = SqlAlchemyProjectRepository(sessions)
    store = build_object_store(settings)
    analysis_cache = AnalysisCache(SqlAlchemyAnalysisRepository(sessions))
    handlers: dict[str, JobHandler] = {DEMO_JOB_KIND: DemoJobHandler()}
    enqueue_job = EnqueueJob(repo, ArqJobQueue(redis), [*handlers.keys(), ANALYZE_PROJECT_JOB_KIND], uuid7, utc_now)
    return Container(
        settings=settings,
        enqueue_job=enqueue_job,
        get_job=GetJob(repo),
        run_job=RunJob(repo, handlers, utc_now),
        check_health=CheckHealth(settings.app_version, PostgresProbe(engine), RedisProbe(redis), S3Probe(settings)),
        create_project=CreateProject(projects, store, FfprobeAudioProbe(), analysis_cache, enqueue_job, uuid7, utc_now),
        get_project=GetProject(projects, repo, analysis_cache),
        analysis_cache=analysis_cache,
        engine=engine,
        redis=redis,
        handlers=handlers,
    )
