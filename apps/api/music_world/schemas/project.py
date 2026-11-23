"""Project contracts: `POST /api/projects` (202) and `GET /api/projects/{id}`."""

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field

from music_world.schemas.base import ContractModel
from music_world.schemas.job import Job

SCHEMA_ID = "music-world.project.v1"
CREATED_SCHEMA_ID = "music-world.project-created.v1"

ProjectStatus = Literal["analyzing", "ready", "failed"]


class ProjectCreated(ContractModel):
    """Body of `202 Accepted` after an upload. `jobId` is null when the analysis was already cached."""

    model_config = ConfigDict(
        title="ProjectCreated",
        json_schema_extra={
            "examples": [
                {"projectId": "0193f1a2-7c4e-7b1a-9f00-1234567890ab", "jobId": None, "status": "ready"},
            ]
        },
    )

    project_id: str
    job_id: str | None = Field(description="Poll `GET /api/jobs/{jobId}`; null when the analysis is cached.")
    status: ProjectStatus


class Project(ContractModel):
    """An uploaded song and the progress of its analysis."""

    model_config = ConfigDict(title="Project")

    id: str = Field(description="UUIDv7.")
    status: ProjectStatus
    audio_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    duration_sec: float = Field(gt=0)
    has_lyrics_file: bool = Field(description="True when an `.lrc` file was uploaded with the audio.")
    job: Job | None = Field(default=None, description="The analysis job, when one was needed.")
    created_at: datetime
