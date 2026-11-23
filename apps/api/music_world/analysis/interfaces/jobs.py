"""Job handler of the `analyze_project` kind (thin: load the project → `AnalyzeAudio`)."""

import structlog

from music_world.analysis.application.ports import ProgressReporter, ProjectAudioSource
from music_world.analysis.application.use_cases.analyze_audio import AnalyzeAudio, AnalyzeAudioInput
from music_world.analysis.domain.errors import AudioMissingError
from music_world.projects.domain.job import Job

log = structlog.get_logger(__name__)


class AnalyzeProjectJobHandler:
    def __init__(self, projects: ProjectAudioSource, analyze: AnalyzeAudio) -> None:
        self._projects, self._analyze = projects, analyze

    async def run(self, job: Job, report: ProgressReporter) -> None:
        if job.subject_id is None:
            raise AudioMissingError("analysis job without a project")
        audio = await self._projects.get(job.subject_id)
        structlog.contextvars.bind_contextvars(project_id=job.subject_id)
        try:
            result = await self._analyze.execute(AnalyzeAudioInput(audio.audio_hash, audio.audio_key), report)
            log.info("analysis.done", notes=len(result.notes), chords=len(result.chords), key=result.key)
        finally:
            structlog.contextvars.unbind_contextvars("project_id")
