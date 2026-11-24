import hashlib
from pathlib import Path

import pytest

from music_world.projects.application.use_cases.create_project import CreateProject
from music_world.projects.application.use_cases.enqueue_job import EnqueueJob
from music_world.projects.application.use_cases.get_project import GetProject
from music_world.projects.domain.errors import (
    AudioFormatUnsupportedError,
    AudioTooLongError,
    AudioUnreadableError,
    ProjectNotFoundError,
)
from music_world.projects.domain.job_kinds import ANALYZE_PROJECT_JOB_KIND
from music_world.projects.domain.project import ProjectStatus
from tests.fakes import (
    FakeAudioProbe,
    FakeClock,
    InMemoryAnalysisRepository,
    InMemoryJobRepository,
    InMemoryObjectStore,
    InMemoryProjectRepository,
    RecordingQueue,
    SequentialIds,
    wav_bytes,
)
from tests.unit.test_analysis_schema import _base


class World:
    def __init__(self, probe: FakeAudioProbe | None = None) -> None:
        self.jobs, self.queue, self.projects = InMemoryJobRepository(), RecordingQueue(), InMemoryProjectRepository()
        self.store, self.analyses, clock, ids = (
            InMemoryObjectStore(),
            InMemoryAnalysisRepository(),
            FakeClock(),
            SequentialIds(),
        )
        enqueue = EnqueueJob(self.jobs, self.queue, {ANALYZE_PROJECT_JOB_KIND}, ids, clock)
        self.create = CreateProject(
            self.projects, self.store, probe or FakeAudioProbe(), self.analyses, enqueue, ids, clock
        )
        self.get = GetProject(self.projects, self.jobs, self.analyses)


@pytest.fixture
def song(tmp_path: Path) -> Path:
    path = tmp_path / "song"
    path.write_bytes(wav_bytes())
    return path


async def test_new_audio_is_stored_and_an_analysis_job_is_enqueued(song: Path) -> None:
    w = World()
    created = await w.create.execute(song, b"[00:01.00]hi")
    digest = hashlib.sha256(song.read_bytes()).hexdigest()
    p = created.project
    assert p.audio_hash == f"sha256:{digest}" and p.audio_key == f"audio/{digest}.wav"
    assert w.store.objects[p.audio_key] == song.read_bytes()
    assert created.job is not None and created.job.kind == ANALYZE_PROJECT_JOB_KIND
    assert created.job.subject_id == p.id and p.job_id == created.job.id
    assert w.queue.enqueued == [created.job.id]
    assert w.projects.projects[p.id] == p and p.lrc_text == "[00:01.00]hi"
    view = await w.get.execute(p.id)
    assert view.status is ProjectStatus.ANALYZING and view.job == created.job


async def test_same_audio_hash_reuses_the_cached_analysis(song: Path) -> None:
    w = World()
    digest = hashlib.sha256(song.read_bytes()).hexdigest()
    from music_world.schemas.analysis import AnalysisResult

    await w.analyses.save(AnalysisResult.model_validate({**_base(), "audioHash": f"sha256:{digest}"}))
    created = await w.create.execute(song)
    assert created.job is None and w.queue.enqueued == []
    assert (await w.get.execute(created.project.id)).status is ProjectStatus.READY


async def test_failed_job_makes_the_project_failed(song: Path) -> None:
    w = World()
    created = await w.create.execute(song)
    assert created.job is not None
    job = await w.jobs.get(created.job.id)
    assert job is not None
    job.fail("STAGE_FAILED", job.created_at)
    await w.jobs.save(job)
    assert (await w.get.execute(created.project.id)).status is ProjectStatus.FAILED


@pytest.mark.parametrize(
    ("content", "probe", "error"),
    [
        (b"OggS" + b"\x00" * 100, FakeAudioProbe(), AudioFormatUnsupportedError),
        (wav_bytes(), FakeAudioProbe(1801.0), AudioTooLongError),
        (wav_bytes(), FakeAudioProbe(AudioUnreadableError("bad")), AudioUnreadableError),
    ],
)
async def test_rejected_uploads_store_nothing(
    tmp_path: Path, content: bytes, probe: FakeAudioProbe, error: type[Exception]
) -> None:
    w = World(probe)
    path = tmp_path / "upload"
    path.write_bytes(content)
    with pytest.raises(error):
        await w.create.execute(path)
    assert w.store.objects == {} and w.projects.projects == {} and w.queue.enqueued == []


async def test_unknown_project_is_not_found() -> None:
    with pytest.raises(ProjectNotFoundError):
        await World().get.execute("00000000-0000-7000-8000-000000000999")
