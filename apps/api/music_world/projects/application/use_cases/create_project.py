import asyncio
import hashlib
from dataclasses import dataclass, replace
from pathlib import Path

from music_world.projects.application.ports import (
    AnalysisLookup,
    AudioProbe,
    AudioStore,
    Clock,
    IdGenerator,
    ProjectRepository,
)
from music_world.projects.application.use_cases.enqueue_job import EnqueueJob
from music_world.projects.domain.job import Job
from music_world.projects.domain.job_kinds import ANALYZE_PROJECT_JOB_KIND
from music_world.projects.domain.project import (
    CONTENT_TYPES,
    SNIFF_BYTES,
    Project,
    check_audio_duration,
    check_audio_size,
    decode_lrc,
    sniff_audio_format,
)

_HASH_CHUNK = 1024 * 1024


@dataclass(frozen=True)
class CreatedProject:
    project: Project
    job: Job | None  # None when the analysis was already cached (requirement 1.4)


def _read_header_and_hash(path: Path) -> tuple[bytes, str, int]:
    digest, size = hashlib.sha256(), 0
    with path.open("rb") as f:
        header = f.read(SNIFF_BYTES)
        digest.update(header)
        size += len(header)
        while chunk := f.read(_HASH_CHUNK):
            digest.update(chunk)
            size += len(chunk)
    return header, f"sha256:{digest.hexdigest()}", size


class CreateProject:
    """Upload → checks (content sniffing, size, duration) → store audio → reuse the cached analysis or enqueue one."""

    def __init__(
        self,
        repo: ProjectRepository,
        store: AudioStore,
        probe: AudioProbe,
        analyses: AnalysisLookup,
        enqueue_job: EnqueueJob,
        new_id: IdGenerator,
        clock: Clock,
    ) -> None:
        self._repo, self._store, self._probe, self._analyses = repo, store, probe, analyses
        self._enqueue_job, self._new_id, self._clock = enqueue_job, new_id, clock

    async def execute(self, audio_path: Path, lrc: bytes | None = None, owner_id: str | None = None) -> CreatedProject:
        header, audio_hash, size = await asyncio.to_thread(_read_header_and_hash, audio_path)
        check_audio_size(size)
        audio_format = sniff_audio_format(header)
        lrc_text = decode_lrc(lrc) if lrc is not None else None
        duration = await self._probe.duration(audio_path)
        check_audio_duration(duration)

        # Content-addressed key: not guessable without the file, and the same song is stored once.
        audio_key = f"audio/{audio_hash.removeprefix('sha256:')}.{audio_format}"
        await self._store.put_file(audio_key, audio_path, CONTENT_TYPES[audio_format])

        project = Project(
            id=self._new_id(),
            audio_hash=audio_hash,
            audio_key=audio_key,
            audio_format=audio_format,
            duration_sec=duration,
            lrc_text=lrc_text,
            job_id=None,
            created_at=self._clock(),
            owner_id=owner_id,
        )
        await self._repo.add(project)  # persisted before the job is enqueued, so the worker always finds it
        if await self._analyses.exists(audio_hash):
            return CreatedProject(project, None)
        job = await self._enqueue_job.execute(ANALYZE_PROJECT_JOB_KIND, subject_id=project.id)
        project = replace(project, job_id=job.id)
        await self._repo.save(project)
        return CreatedProject(project, job)
