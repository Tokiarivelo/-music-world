"""Background job contracts: `GET /api/jobs/{id}` and `202 Accepted` bodies."""

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field

from music_world.schemas.base import ContractModel

SCHEMA_ID = "music-world.job.v1"
ACCEPTED_SCHEMA_ID = "music-world.job-accepted.v1"

JobStatus = Literal["queued", "running", "done", "failed"]


class Job(ContractModel):
    """Status and progress of a background job."""

    model_config = ConfigDict(
        title="Job",
        json_schema_extra={
            "examples": [
                {
                    "id": "0193f1a2-7c4e-7b1a-9f00-1234567890ab",
                    "kind": "demo",
                    "status": "running",
                    "stage": "step-2",
                    "progress": 0.5,
                    "error": None,
                    "createdAt": "2026-11-23T10:00:00Z",
                    "updatedAt": "2026-11-23T10:00:05Z",
                }
            ]
        },
    )

    id: str = Field(description="UUIDv7.")
    kind: str = Field(min_length=1)
    status: JobStatus
    stage: str | None = Field(default=None, description="Current stage name, if the job reports stages.")
    progress: float = Field(ge=0, le=1)
    error: str | None = Field(default=None, description="Error code when status is `failed`.")
    created_at: datetime
    updated_at: datetime


class JobAccepted(ContractModel):
    """Body of a `202 Accepted` response; poll `GET /api/jobs/{jobId}`."""

    model_config = ConfigDict(title="JobAccepted")

    job_id: str
