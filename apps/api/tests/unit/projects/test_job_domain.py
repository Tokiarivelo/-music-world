from datetime import UTC, datetime

import pytest
from hypothesis import given
from hypothesis import strategies as st

from music_world.projects.domain.errors import InvalidJobProgressError, InvalidJobTransitionError
from music_world.projects.domain.job import Job, JobStatus

T0 = datetime(2026, 11, 23, tzinfo=UTC)


def running() -> Job:
    job = Job.queued("j1", "demo", T0)
    job.start(T0)
    return job


@given(st.lists(st.floats(min_value=0, max_value=1, allow_nan=False), max_size=50))
def test_progress_is_monotonic_and_bounded(updates: list[float]) -> None:
    job = running()
    seen = [job.progress]
    for value in updates:
        job.report(value, None, T0)
        seen.append(job.progress)
    assert all(0 <= p <= 1 for p in seen)
    assert seen == sorted(seen)


@given(st.one_of(st.floats(max_value=-1e-9), st.floats(min_value=1 + 1e-9), st.just(float("nan"))))
def test_out_of_range_progress_is_rejected(value: float) -> None:
    with pytest.raises(InvalidJobProgressError):
        running().report(value, None, T0)


def test_lifecycle_done_sets_full_progress() -> None:
    job = running()
    job.report(0.4, "separate", T0)
    job.complete(T0)
    assert (job.status, job.progress, job.stage, job.is_finished) == (JobStatus.DONE, 1.0, "separate", True)


@pytest.mark.parametrize("finish", ["complete", "fail"])
def test_finished_jobs_are_terminal(finish: str) -> None:
    job = running()
    job.complete(T0) if finish == "complete" else job.fail("BOOM", T0)
    for action in (lambda: job.start(T0), lambda: job.complete(T0), lambda: job.fail("X", T0)):
        with pytest.raises(InvalidJobTransitionError):
            action()


def test_cannot_complete_or_report_a_queued_job() -> None:
    job = Job.queued("j1", "demo", T0)
    with pytest.raises(InvalidJobTransitionError):
        job.complete(T0)
    with pytest.raises(InvalidJobTransitionError):
        job.report(0.5, None, T0)
