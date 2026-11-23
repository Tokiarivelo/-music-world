"""Bridge to the projects context: reads a project through its `GetProject` use case (never its storage)."""

from music_world.analysis.application.ports import ProjectAudio
from music_world.projects.application.use_cases.get_project import GetProject


class ProjectsAudioSource:
    def __init__(self, get_project: GetProject) -> None:
        self._get_project = get_project

    async def get(self, project_id: str) -> ProjectAudio:
        project = (await self._get_project.execute(project_id)).project
        return ProjectAudio(project.audio_hash, project.audio_key, project.lrc_text)
