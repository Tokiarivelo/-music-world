"""arq job handlers (thin: call the use case)."""

from typing import Any

import structlog

from music_world.projects.application.use_cases.run_job import RunJob

log = structlog.get_logger(__name__)


async def run_job(ctx: dict[str, Any], job_id: str) -> str:
    use_case: RunJob = ctx["container"].run_job
    structlog.contextvars.bind_contextvars(job_id=job_id)
    try:
        job = await use_case.execute(job_id)
        log.info("job.finished", status=job.status.value, kind=job.kind)
        return job.status.value
    except Exception:
        log.exception("job.crashed")
        raise
    finally:
        structlog.contextvars.unbind_contextvars("job_id")
