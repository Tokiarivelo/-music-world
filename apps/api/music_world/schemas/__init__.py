"""Shared data contracts: the single source of truth for Python and TypeScript.

Every exported model is registered in `EXPORTED` with its versioned schema id
(`music-world.<name>.v<N>`). `make schemas` exports them to `packages/schemas`
and generates TS types + zod validators in `apps/web/src/templates/generated`.
"""

from pydantic import BaseModel

from music_world.schemas import health, job
from music_world.schemas.health import DependencyChecks, Health
from music_world.schemas.job import Job, JobAccepted

EXPORTED: dict[str, type[BaseModel]] = {
    health.SCHEMA_ID: Health,
    job.SCHEMA_ID: Job,
    job.ACCEPTED_SCHEMA_ID: JobAccepted,
}

__all__ = ["EXPORTED", "DependencyChecks", "Health", "Job", "JobAccepted"]
