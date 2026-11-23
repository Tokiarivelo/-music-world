"""Job aggregate: lifecycle of a background job (queued → running → done | failed)."""

import math
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from music_world.projects.domain.errors import InvalidJobProgressError, InvalidJobTransitionError


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


@dataclass
class Job:
    id: str
    kind: str
    status: JobStatus
    progress: float
    stage: str | None
    error: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def queued(cls, job_id: str, kind: str, now: datetime) -> "Job":
        return cls(job_id, kind, JobStatus.QUEUED, 0.0, None, None, now, now)

    @property
    def is_finished(self) -> bool:
        return self.status in (JobStatus.DONE, JobStatus.FAILED)

    def start(self, now: datetime) -> None:
        """Queued → running. Running → running is allowed so a crashed job can resume."""
        self._require(JobStatus.QUEUED, JobStatus.RUNNING, action="start")
        self.status = JobStatus.RUNNING
        self.updated_at = now

    def report(self, progress: float, stage: str | None, now: datetime) -> None:
        """Progress never goes backwards, so pollers see a monotonic value in [0, 1]."""
        self._require(JobStatus.RUNNING, action="report progress")
        if math.isnan(progress) or not 0.0 <= progress <= 1.0:
            raise InvalidJobProgressError(f"progress must be in [0, 1], got {progress}")
        self.progress = max(self.progress, progress)
        if stage is not None:
            self.stage = stage
        self.updated_at = now

    def complete(self, now: datetime) -> None:
        self._require(JobStatus.RUNNING, action="complete")
        self.status = JobStatus.DONE
        self.progress = 1.0
        self.updated_at = now

    def fail(self, error_code: str, now: datetime) -> None:
        self._require(JobStatus.QUEUED, JobStatus.RUNNING, action="fail")
        self.status = JobStatus.FAILED
        self.error = error_code
        self.updated_at = now

    def _require(self, *allowed: JobStatus, action: str) -> None:
        if self.status not in allowed:
            raise InvalidJobTransitionError(f"cannot {action} a {self.status} job")
