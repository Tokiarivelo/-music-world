import re

from music_world.projects.application.ports import ProjectRepository
from music_world.projects.domain.errors import ProjectNotFoundError
from music_world.projects.domain.project import Project, can_access

_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


class CheckProjectAccess:
    """Raises `ProjectNotFoundError` (404) when the project is missing or owned by someone else: existence never
    leaks (coding-standards § Security)."""

    def __init__(self, repo: ProjectRepository) -> None:
        self._repo = repo

    async def execute(self, project_id: str, caller_id: str | None) -> Project:
        project = await self._repo.get(project_id) if _UUID.match(project_id) else None
        if project is None or not can_access(project, caller_id):
            raise ProjectNotFoundError(f"project {project_id} not found")
        return project
