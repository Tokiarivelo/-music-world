"""Health contract returned by `GET /api/health`."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_ID = "music-world.health.v1"


class Health(BaseModel):
    """Liveness status of the API."""

    model_config = ConfigDict(extra="forbid", title="Health")

    status: Literal["ok", "degraded"] = Field(description="Overall service status.")
    version: str = Field(min_length=1, description="Application version.")
