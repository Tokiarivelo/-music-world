from dataclasses import dataclass

from music_world.projects.application.ports import AnalysisLookup, JobRepository, ProjectRepository
from music_world.projects.domain.errors import ProjectNotFoundError
from music_world.projects.domain.job import Job, JobStatus
from music_world.projects.domain.project import Project, ProjectStatus


@dataclass(frozen=True)
class ProjectView:
    project: Project
    status: ProjectStatus
    job: Job | None


class GetProject:
    """A project and its analysis status: ready once the analysis of its audio hash exists."""

    def __init__(self, repo: ProjectRepository, jobs: JobRepository, analyses: AnalysisLookup) -> None:
        self._repo, self._jobs, self._analyses = repo, jobs, analyses

    async def execute(self, project_id: str) -> ProjectView:
        project = await self._repo.get(project_id)
        if project is None:
            raise ProjectNotFoundError(f"project {project_id} not found")
        job = await self._jobs.get(project.job_id) if project.job_id else None
        if await self._analyses.exists(project.audio_hash):
            status = ProjectStatus.READY
        elif job is not None and job.status is JobStatus.FAILED:
            status = ProjectStatus.FAILED
        else:
            status = ProjectStatus.ANALYZING
        return ProjectView(project, status, job)
