"""Ports of the projects context (implemented in infrastructure/)."""

from collections.abc import Callable
from datetime import datetime
from typing import Protocol

from music_world.projects.domain.job import Job

Clock = Callable[[], datetime]
IdGenerator = Callable[[], str]


class JobRepository(Protocol):
    async def add(self, job: Job) -> None: ...
    async def get(self, job_id: str) -> Job | None: ...
    async def save(self, job: Job) -> None: ...


class JobQueue(Protocol):
    async def enqueue(self, job_id: str) -> None: ...


class ProgressReporter(Protocol):
    async def __call__(self, progress: float, stage: str | None = None) -> None: ...


class JobHandler(Protocol):
    """Does the work of one job kind; reports progress, raises `MusicWorldError` on expected failures."""

    async def run(self, job: Job, report: ProgressReporter) -> None: ...
