from music_world.projects.application.ports import JobRepository
from music_world.projects.domain.errors import JobNotFoundError
from music_world.projects.domain.job import Job


class GetJob:
    def __init__(self, repo: JobRepository) -> None:
        self._repo = repo

    async def execute(self, job_id: str) -> Job:
        job = await self._repo.get(job_id)
        if job is None:
            raise JobNotFoundError(f"job {job_id} not found")
        return job
