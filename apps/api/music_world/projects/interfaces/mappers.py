from music_world.projects.domain.job import Job
from music_world.schemas import Job as JobContract


def job_to_contract(job: Job) -> JobContract:
    return JobContract(
        id=job.id,
        kind=job.kind,
        status=job.status.value,
        stage=job.stage,
        progress=job.progress,
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )
