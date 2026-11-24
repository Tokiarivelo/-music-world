from dataclasses import replace

from music_world.projects.application.ports import ProjectRepository
from music_world.projects.domain.errors import EditsTooLargeError, ProjectNotFoundError
from music_world.projects.domain.project import Project
from music_world.schemas.edits import LayoutEdits

MAX_EDITS_BYTES = 64 * 1024


async def _owned(repo: ProjectRepository, project_id: str, caller_id: str) -> Project:
    """Edits belong to the owner: anyone else (and unowned projects) get the same 404 as a missing project."""
    project = await repo.get(project_id)
    if project is None or project.owner_id != caller_id:
        raise ProjectNotFoundError(f"project {project_id} not found")
    return project


class GetProjectEdits:
    def __init__(self, repo: ProjectRepository) -> None:
        self._repo = repo

    async def execute(self, project_id: str, caller_id: str) -> LayoutEdits:
        project = await _owned(self._repo, project_id, caller_id)
        if project.edits_json is None:
            return LayoutEdits()
        return LayoutEdits.model_validate_json(project.edits_json)


class SaveProjectEdits:
    def __init__(self, repo: ProjectRepository) -> None:
        self._repo = repo

    async def execute(self, project_id: str, caller_id: str, edits: LayoutEdits) -> LayoutEdits:
        project = await _owned(self._repo, project_id, caller_id)
        text = edits.model_dump_json(by_alias=True, exclude_none=True)
        if len(text.encode()) > MAX_EDITS_BYTES:
            raise EditsTooLargeError(f"edits are larger than {MAX_EDITS_BYTES // 1024} KB")
        await self._repo.save(replace(project, edits_json=text))
        return edits
