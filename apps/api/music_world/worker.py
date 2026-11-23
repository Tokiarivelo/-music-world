"""arq worker. Run: `arq music_world.worker.WorkerSettings`."""

import os
from typing import Any, ClassVar

from arq.connections import RedisSettings

from music_world.projects.interfaces.jobs import run_job
from music_world.shared.container import build_container
from music_world.shared.logging import configure_logging
from music_world.shared.settings import get_settings

JOB_TIMEOUT_SECONDS = 15 * 60


async def startup(ctx: dict[str, Any]) -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    ctx["container"] = build_container(settings, with_analysis=True)


async def shutdown(ctx: dict[str, Any]) -> None:
    await ctx["container"].close()


class WorkerSettings:
    functions: ClassVar[list[Any]] = [run_job]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    job_timeout = JOB_TIMEOUT_SECONDS
    # Demucs and Basic Pitch already use every core (torch / onnxruntime threads) and ~2 GB RAM per job:
    # one analysis job per 4 cores.
    max_jobs = max(1, (os.cpu_count() or 1) // 4)
    max_tries = 3
