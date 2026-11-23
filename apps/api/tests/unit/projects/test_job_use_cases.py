import pytest

from music_world.projects.application.ports import ProgressReporter
from music_world.projects.application.use_cases.enqueue_job import EnqueueJob
from music_world.projects.application.use_cases.get_job import GetJob
from music_world.projects.application.use_cases.run_job import RunJob
from music_world.projects.domain.errors import JobNotFoundError, UnknownJobKindError
from music_world.projects.domain.job import Job, JobStatus
from music_world.projects.infrastructure.demo_job_handler import DemoJobHandler
from music_world.shared.errors import MusicWorldError
from tests.fakes import FakeClock, InMemoryJobRepository, RecordingQueue, SequentialIds


class StageError(MusicWorldError):
    code = "STAGE_FAILED"


class FailingHandler:
    def __init__(self, error: Exception) -> None:
        self.error = error

    async def run(self, job: Job, report: ProgressReporter) -> None:
        await report(0.3, "half")
        raise self.error


@pytest.fixture
def repo() -> InMemoryJobRepository:
    return InMemoryJobRepository()


async def enqueue(repo: InMemoryJobRepository, kind: str = "demo") -> tuple[Job, RecordingQueue]:
    queue = RecordingQueue()
    job = await EnqueueJob(repo, queue, {"demo"}, SequentialIds(), FakeClock()).execute(kind)
    return job, queue


async def test_enqueue_persists_then_enqueues(repo: InMemoryJobRepository) -> None:
    job, queue = await enqueue(repo)
    assert queue.enqueued == [job.id]
    assert (await GetJob(repo).execute(job.id)).status is JobStatus.QUEUED


async def test_enqueue_rejects_unknown_kind(repo: InMemoryJobRepository) -> None:
    with pytest.raises(UnknownJobKindError):
        await enqueue(repo, kind="nope")
    assert repo.jobs == {}


async def test_get_missing_job_raises_not_found(repo: InMemoryJobRepository) -> None:
    with pytest.raises(JobNotFoundError):
        await GetJob(repo).execute("missing")


async def test_run_demo_job_reports_progress_and_completes(repo: InMemoryJobRepository) -> None:
    job, _ = await enqueue(repo)
    done = await RunJob(repo, {"demo": DemoJobHandler(steps=4, step_seconds=0)}, FakeClock()).execute(job.id)
    assert (done.status, done.progress, done.stage) == (JobStatus.DONE, 1.0, "step-4")
    assert repo.saves == 1 + 4 + 1  # start, 4 progress reports, completion


async def test_run_is_idempotent_for_finished_jobs(repo: InMemoryJobRepository) -> None:
    job, _ = await enqueue(repo)
    run = RunJob(repo, {"demo": DemoJobHandler(step_seconds=0)}, FakeClock())
    first = await run.execute(job.id)
    saves = repo.saves
    again = await run.execute(job.id)
    assert again == first and repo.saves == saves


async def test_domain_error_fails_the_job_with_its_code(repo: InMemoryJobRepository) -> None:
    job, _ = await enqueue(repo)
    failed = await RunJob(repo, {"demo": FailingHandler(StageError("bad audio"))}, FakeClock()).execute(job.id)
    assert (failed.status, failed.error, failed.progress) == (JobStatus.FAILED, "STAGE_FAILED", 0.3)


async def test_unexpected_error_fails_the_job_and_propagates(repo: InMemoryJobRepository) -> None:
    job, _ = await enqueue(repo)
    with pytest.raises(RuntimeError):
        await RunJob(repo, {"demo": FailingHandler(RuntimeError("bug"))}, FakeClock()).execute(job.id)
    stored = await GetJob(repo).execute(job.id)
    assert (stored.status, stored.error) == (JobStatus.FAILED, "INTERNAL_ERROR")


async def test_job_without_handler_fails(repo: InMemoryJobRepository) -> None:
    job, _ = await enqueue(repo)
    failed = await RunJob(repo, {}, FakeClock()).execute(job.id)
    assert (failed.status, failed.error) == (JobStatus.FAILED, "JOB_KIND_UNKNOWN")
