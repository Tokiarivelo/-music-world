from collections.abc import Collection

from music_world.projects.application.ports import Clock, IdGenerator, JobQueue, JobRepository
from music_world.projects.domain.errors import UnknownJobKindError
from music_world.projects.domain.job import Job


class EnqueueJob:
    def __init__(
        self, repo: JobRepository, queue: JobQueue, kinds: Collection[str], new_id: IdGenerator, clock: Clock
    ) -> None:
        self._repo, self._queue, self._kinds, self._new_id, self._clock = repo, queue, kinds, new_id, clock

    async def execute(self, kind: str) -> Job:
        if kind not in self._kinds:
            raise UnknownJobKindError(f"unknown job kind: {kind}")
        job = Job.queued(self._new_id(), kind, self._clock())
        await self._repo.add(job)  # persisted before enqueue so the worker always finds it
        await self._queue.enqueue(job.id)
        return job
