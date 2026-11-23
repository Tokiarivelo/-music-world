"""In-memory fakes of the projects/system ports, shared by tests."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

from music_world.projects.domain.job import Job
from music_world.system.application.ports import CheckStatus


class FakeClock:
    def __init__(self) -> None:
        self.now = datetime(2026, 11, 23, 10, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        self.now += timedelta(seconds=1)
        return self.now


class SequentialIds:
    def __init__(self) -> None:
        self.n = 0

    def __call__(self) -> str:
        self.n += 1
        return f"00000000-0000-7000-8000-{self.n:012d}"


class InMemoryJobRepository:
    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}
        self.saves = 0

    async def add(self, job: Job) -> None:
        self.jobs[job.id] = replace(job)

    async def get(self, job_id: str) -> Job | None:
        job = self.jobs.get(job_id)
        return replace(job) if job else None

    async def save(self, job: Job) -> None:
        self.saves += 1
        self.jobs[job.id] = replace(job)


class RecordingQueue:
    def __init__(self) -> None:
        self.enqueued: list[str] = []

    async def enqueue(self, job_id: str) -> None:
        self.enqueued.append(job_id)


class StaticProbe:
    def __init__(self, result: CheckStatus | Exception) -> None:
        self.result = result

    async def check(self) -> CheckStatus:
        if isinstance(self.result, Exception):
            raise self.result
        return self.result
