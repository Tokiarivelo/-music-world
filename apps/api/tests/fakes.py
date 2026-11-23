"""In-memory fakes of the ports, shared by tests."""

import io
import math
import struct
import wave
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

from music_world.projects.domain.job import Job
from music_world.projects.domain.project import Project
from music_world.schemas.analysis import AnalysisResult
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


class InMemoryProjectRepository:
    def __init__(self) -> None:
        self.projects: dict[str, Project] = {}

    async def add(self, project: Project) -> None:
        self.projects[project.id] = project

    async def get(self, project_id: str) -> Project | None:
        return self.projects.get(project_id)

    async def save(self, project: Project) -> None:
        self.projects[project.id] = project


class FakeAudioProbe:
    def __init__(self, duration: float | Exception = 10.0) -> None:
        self.result = duration

    async def duration(self, path: Path) -> float:
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


class InMemoryObjectStore:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    async def put_file(self, key: str, path: Path, content_type: str) -> None:
        self.objects[key] = path.read_bytes()

    async def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data

    async def get_bytes(self, key: str) -> bytes | None:
        return self.objects.get(key)

    async def get_file(self, key: str, dest: Path) -> bool:
        if key not in self.objects:
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(self.objects[key])
        return True

    async def exists(self, key: str) -> bool:
        return key in self.objects


class InMemoryAnalysisRepository:
    def __init__(self) -> None:
        self.results: dict[str, AnalysisResult] = {}

    async def exists(self, audio_hash: str) -> bool:
        return audio_hash in self.results

    async def get(self, audio_hash: str) -> AnalysisResult | None:
        return self.results.get(audio_hash)

    async def save(self, result: AnalysisResult) -> None:
        self.results[result.audio_hash] = result


def wav_bytes(seconds: float = 0.5, sample_rate: int = 8000, freq: float = 440.0) -> bytes:
    """A tiny mono 16-bit sine WAV (synthesized, so royalty-free)."""
    frames = int(seconds * sample_rate)
    samples = (int(12000 * math.sin(2 * math.pi * freq * i / sample_rate)) for i in range(frames))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(b"".join(struct.pack("<h", s) for s in samples))
    return buf.getvalue()
