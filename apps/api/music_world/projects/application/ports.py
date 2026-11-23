"""Ports of the projects context (implemented in infrastructure/)."""

from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Protocol

from music_world.projects.domain.job import Job
from music_world.projects.domain.project import Project

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


class ProjectRepository(Protocol):
    async def add(self, project: Project) -> None: ...
    async def get(self, project_id: str) -> Project | None: ...
    async def save(self, project: Project) -> None: ...


class AudioProbe(Protocol):
    """Reads the duration of an audio file from its content; raises `AudioUnreadableError`."""

    async def duration(self, path: Path) -> float: ...


class AudioStore(Protocol):
    async def put_file(self, key: str, path: Path, content_type: str) -> None: ...


class AnalysisLookup(Protocol):
    """Implemented by the analysis context: is there a cached `AnalysisResult` for this audio hash?"""

    async def exists(self, audio_hash: str) -> bool: ...
