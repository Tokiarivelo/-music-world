from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, status

from music_world.projects.application.use_cases.enqueue_job import EnqueueJob
from music_world.projects.application.use_cases.get_job import GetJob
from music_world.projects.domain.job_kinds import DEMO_JOB_KIND
from music_world.projects.interfaces.mappers import job_to_contract
from music_world.schemas import Job, JobAccepted
from music_world.shared.http import ERROR_RESPONSES

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _get_job(request: Request) -> GetJob:
    use_case: GetJob = request.app.state.container.get_job
    return use_case


def _enqueue_job(request: Request) -> EnqueueJob:
    use_case: EnqueueJob = request.app.state.container.enqueue_job
    return use_case


@router.get(
    "/{job_id}",
    response_model=Job,
    response_model_by_alias=True,
    summary="Get the status and progress of a background job",
    responses={404: ERROR_RESPONSES[404]},
)
async def get_job(job_id: Annotated[str, Path(max_length=64)], use_case: Annotated[GetJob, Depends(_get_job)]) -> Job:
    return job_to_contract(await use_case.execute(job_id))


# Development only (registered by main.py when APP_ENV=development): exercises the queue end to end.
demo_router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@demo_router.post(
    "/demo",
    response_model=JobAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enqueue a fake demo job (development only)",
)
async def enqueue_demo_job(use_case: Annotated[EnqueueJob, Depends(_enqueue_job)]) -> JobAccepted:
    job = await use_case.execute(DEMO_JOB_KIND)
    return JobAccepted(job_id=job.id)
