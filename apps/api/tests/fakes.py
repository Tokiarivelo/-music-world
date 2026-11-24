"""In-memory fakes of the ports, shared by tests."""

import io
import math
import struct
import wave
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

from music_world.accounts.domain.model import LoginToken, Session, User
from music_world.projects.domain.job import Job
from music_world.projects.domain.project import Project
from music_world.schemas.analysis import AnalysisResult
from music_world.system.application.ports import CheckStatus
from music_world.templates.domain.model import PageCursor, StoreTemplate, TemplateReport, TemplateStatus


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


class InMemoryUserRepository:
    def __init__(self) -> None:
        self.users: dict[str, User] = {}

    async def get(self, user_id: str) -> User | None:
        return self.users.get(user_id)

    async def get_by_email(self, email: str) -> User | None:
        return next((u for u in self.users.values() if u.email == email), None)

    async def add(self, user: User) -> None:
        self.users[user.id] = user


class InMemoryLoginTokenRepository:
    def __init__(self) -> None:
        self.tokens: dict[str, tuple[LoginToken, datetime | None]] = {}

    async def add(self, token: LoginToken) -> None:
        self.tokens[token.token_hash] = (token, None)

    async def consume(self, token_hash: str, now: datetime) -> str | None:
        entry = self.tokens.get(token_hash)
        if entry is None or entry[1] is not None or entry[0].expires_at <= now:
            return None
        self.tokens[token_hash] = (entry[0], now)
        return entry[0].email


class InMemorySessionRepository:
    def __init__(self) -> None:
        self.sessions: dict[str, Session] = {}

    async def add(self, session: Session) -> None:
        self.sessions[session.token_hash] = session

    async def get(self, token_hash: str) -> Session | None:
        return self.sessions.get(token_hash)

    async def delete(self, token_hash: str) -> None:
        self.sessions.pop(token_hash, None)


class CapturingEmailSender:
    def __init__(self, error: Exception | None = None) -> None:
        self.sent: list[tuple[str, str]] = []
        self.error = error

    async def send_sign_in_link(self, email: str, link: str) -> None:
        if self.error is not None:
            raise self.error
        self.sent.append((email, link))

    def last_token(self) -> str:
        from urllib.parse import parse_qs, urlsplit

        return parse_qs(urlsplit(self.sent[-1][1]).query)["token"][0]


class InMemoryStoreTemplateRepository:
    def __init__(self) -> None:
        self.templates: dict[str, StoreTemplate] = {}

    async def add(self, template: StoreTemplate) -> None:
        self.templates[template.id] = template

    async def get(self, template_id: str) -> StoreTemplate | None:
        return self.templates.get(template_id)

    async def save(self, template: StoreTemplate) -> None:
        self.templates[template.id] = template

    async def delete(self, template_id: str) -> None:
        self.templates.pop(template_id, None)

    async def list_published(self, after: PageCursor | None, limit: int) -> list[StoreTemplate]:
        rows = sorted(
            (t for t in self.templates.values() if t.status is TemplateStatus.PUBLISHED and t.published_at),
            key=lambda t: (t.published_at, t.id),
            reverse=True,
        )
        if after is not None:
            rows = [t for t in rows if (t.published_at, t.id) < (after.published_at, after.id)]
        return rows[:limit]

    async def list_by_owner(self, owner_id: str, limit: int) -> list[StoreTemplate]:
        rows = [t for t in self.templates.values() if t.owner_id == owner_id]
        return sorted(rows, key=lambda t: t.created_at, reverse=True)[:limit]


class InMemoryReportRepository:
    def __init__(self) -> None:
        self.reports: dict[tuple[str, str], TemplateReport] = {}

    async def add(self, report: TemplateReport) -> bool:
        key = (report.template_id, report.user_id)
        if key in self.reports:
            return False
        self.reports[key] = report
        return True

    async def count(self, template_id: str) -> int:
        return sum(1 for t, _ in self.reports if t == template_id)
