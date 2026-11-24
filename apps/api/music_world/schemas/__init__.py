"""Shared data contracts: the single source of truth for Python and TypeScript.

Every exported model is registered in `EXPORTED` with its versioned schema id
(`music-world.<name>.v<N>`). `make schemas` exports them to `packages/schemas`
and generates TS types + zod validators in `apps/web/src/templates/generated`.
"""

from pydantic import BaseModel

from music_world.schemas import account, analysis, director, health, job, project, store, template
from music_world.schemas.account import AuthSession
from music_world.schemas.analysis import AnalysisResult
from music_world.schemas.director import DirectorProviders, DirectorResult
from music_world.schemas.health import DependencyChecks, Health
from music_world.schemas.job import Job, JobAccepted
from music_world.schemas.project import Project, ProjectCreated
from music_world.schemas.store import StoreTemplate, StoreTemplatePage
from music_world.schemas.template import WorldTemplate

EXPORTED: dict[str, type[BaseModel]] = {
    analysis.SCHEMA_ID: AnalysisResult,
    director.PROVIDERS_SCHEMA_ID: DirectorProviders,
    director.RESULT_SCHEMA_ID: DirectorResult,
    health.SCHEMA_ID: Health,
    job.SCHEMA_ID: Job,
    job.ACCEPTED_SCHEMA_ID: JobAccepted,
    project.SCHEMA_ID: Project,
    project.CREATED_SCHEMA_ID: ProjectCreated,
    account.SESSION_SCHEMA_ID: AuthSession,
    store.TEMPLATE_SCHEMA_ID: StoreTemplate,
    store.PAGE_SCHEMA_ID: StoreTemplatePage,
    template.SCHEMA_ID: WorldTemplate,
}

__all__ = [
    "EXPORTED",
    "AnalysisResult",
    "AuthSession",
    "DependencyChecks",
    "DirectorProviders",
    "DirectorResult",
    "Health",
    "Job",
    "JobAccepted",
    "Project",
    "ProjectCreated",
    "StoreTemplate",
    "StoreTemplatePage",
    "WorldTemplate",
]
