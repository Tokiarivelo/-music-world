from music_world.projects.application.use_cases.get_project import ProjectView
from music_world.projects.domain.job import Job
from music_world.schemas import Job as JobContract
from music_world.schemas import Project as ProjectContract


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


def project_to_contract(view: ProjectView) -> ProjectContract:
    p = view.project
    return ProjectContract(
        id=p.id,
        status=view.status.value,
        audio_hash=p.audio_hash,
        duration_sec=p.duration_sec,
        has_lyrics_file=p.lrc_text is not None,
        job=job_to_contract(view.job) if view.job else None,
        created_at=p.created_at,
    )
