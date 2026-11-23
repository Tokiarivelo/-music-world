"""Composition root: the only place where ports are bound to adapters."""

from dataclasses import dataclass, field

from arq.connections import ArqRedis
from sqlalchemy.ext.asyncio import AsyncEngine

from music_world.projects.application.ports import JobHandler
from music_world.projects.application.use_cases.enqueue_job import EnqueueJob
from music_world.projects.application.use_cases.get_job import GetJob
from music_world.projects.application.use_cases.run_job import RunJob
from music_world.projects.domain.job_kinds import DEMO_JOB_KIND
from music_world.projects.infrastructure.arq_job_queue import ArqJobQueue
from music_world.projects.infrastructure.demo_job_handler import DemoJobHandler
from music_world.projects.infrastructure.sqlalchemy_job_repository import SqlAlchemyJobRepository
from music_world.shared.clock import utc_now
from music_world.shared.db import create_engine, create_session_factory
from music_world.shared.ids import uuid7
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
    redis = ArqRedis.from_url(settings.redis_url)
    repo = SqlAlchemyJobRepository(create_session_factory(engine))
    handlers: dict[str, JobHandler] = {DEMO_JOB_KIND: DemoJobHandler()}
    return Container(
        settings=settings,
        enqueue_job=EnqueueJob(repo, ArqJobQueue(redis), handlers.keys(), uuid7, utc_now),
        get_job=GetJob(repo),
        run_job=RunJob(repo, handlers, utc_now),
        check_health=CheckHealth(settings.app_version, PostgresProbe(engine), RedisProbe(redis), S3Probe(settings)),
        engine=engine,
        redis=redis,
        handlers=handlers,
    )
