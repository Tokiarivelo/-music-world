"""Fake job used to exercise the queue end to end (01-foundation task 4.2)."""

import asyncio

from music_world.projects.application.ports import ProgressReporter
from music_world.projects.domain.job import Job


class DemoJobHandler:
    def __init__(self, steps: int = 4, step_seconds: float = 0.5) -> None:
        self._steps, self._step_seconds = steps, step_seconds

    async def run(self, job: Job, report: ProgressReporter) -> None:
        for step in range(1, self._steps + 1):
            await asyncio.sleep(self._step_seconds)
            await report(step / self._steps, f"step-{step}")
