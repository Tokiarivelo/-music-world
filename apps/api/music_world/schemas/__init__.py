"""Shared data contracts: the single source of truth for Python and TypeScript.

Every exported model is registered in `EXPORTED` with its versioned schema id
(`music-world.<name>.v<N>`). `make schemas` exports them to `packages/schemas`
and generates TS types + zod validators in `apps/web/src/templates/generated`.
"""

from pydantic import BaseModel

from music_world.schemas import health
from music_world.schemas.health import Health

EXPORTED: dict[str, type[BaseModel]] = {
    health.SCHEMA_ID: Health,
}

__all__ = ["EXPORTED", "Health"]
