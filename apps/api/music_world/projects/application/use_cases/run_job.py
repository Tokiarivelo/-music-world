from collections.abc import Mapping

from music_world.projects.application.ports import Clock, JobHandler, JobRepository
from music_world.projects.domain.errors import JobNotFoundError, UnknownJobKindError
from music_world.projects.domain.job import Job
from music_world.shared.errors import MusicWorldError


class RunJob:
    """Runs one job with its handler. Idempotent: a finished job is returned unchanged."""

    def __init__(self, repo: JobRepository, handlers: Mapping[str, JobHandler], clock: Clock) -> None:
        self._repo, self._handlers, self._clock = repo, handlers, clock

    async def execute(self, job_id: str) -> Job:
        job = await self._repo.get(job_id)
        if job is None:
            raise JobNotFoundError(f"job {job_id} not found")
        if job.is_finished:
            return job

        handler = self._handlers.get(job.kind)
        if handler is None:
            job.fail(UnknownJobKindError.code, self._clock())
            await self._repo.save(job)
            return job

        job.start(self._clock())
        await self._repo.save(job)

        async def report(progress: float, stage: str | None = None) -> None:
            job.report(progress, stage, self._clock())
            await self._repo.save(job)

        try:
            await handler.run(job, report)
        except MusicWorldError as error:
            job.fail(error.code, self._clock())
        except Exception:  # unexpected: record a stable code, the worker logs the traceback
            job.fail(MusicWorldError.code, self._clock())
            await self._repo.save(job)
            raise
        else:
            job.complete(self._clock())
        await self._repo.save(job)
        return job
