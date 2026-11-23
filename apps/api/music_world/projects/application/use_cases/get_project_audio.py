from dataclasses import dataclass

from music_world.projects.application.ports import AudioStore, ProjectRepository
from music_world.projects.domain.errors import ProjectNotFoundError
from music_world.projects.domain.project import CONTENT_TYPES


@dataclass(frozen=True)
class ProjectAudioFile:
    data: bytes
    content_type: str


class GetProjectAudio:
    """The uploaded audio of a project (≤ 25 MB), for playback in the browser."""

    def __init__(self, repo: ProjectRepository, store: AudioStore) -> None:
        self._repo, self._store = repo, store

    async def execute(self, project_id: str) -> ProjectAudioFile:
        project = await self._repo.get(project_id)
        data = await self._store.get_bytes(project.audio_key) if project else None
        if project is None or data is None:
            raise ProjectNotFoundError(f"project {project_id} not found")
        return ProjectAudioFile(data, CONTENT_TYPES[project.audio_format])
