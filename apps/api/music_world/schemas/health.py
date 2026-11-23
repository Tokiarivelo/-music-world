"""Health contract returned by `GET /api/health`."""

from typing import Literal

from pydantic import ConfigDict, Field

from music_world.schemas.base import ContractModel

SCHEMA_ID = "music-world.health.v1"

CheckStatus = Literal["ok", "error", "not_configured"]


class DependencyChecks(ContractModel):
    postgres: CheckStatus
    redis: CheckStatus
    storage: CheckStatus = Field(description="S3-compatible object storage (OVHcloud).")


class Health(ContractModel):
    """Liveness status of the API and of its dependencies."""

    model_config = ConfigDict(
        title="Health",
        json_schema_extra={
            "examples": [
                {"status": "ok", "version": "0.1.0", "checks": {"postgres": "ok", "redis": "ok", "storage": "ok"}}
            ]
        },
    )

    status: Literal["ok", "degraded"] = Field(description="`degraded` when a configured dependency fails.")
    version: str = Field(min_length=1, description="Application version.")
    checks: DependencyChecks
