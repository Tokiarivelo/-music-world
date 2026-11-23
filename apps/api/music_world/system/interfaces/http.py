from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from music_world.schemas import Health
from music_world.system.application.use_cases.check_health import CheckHealth

router = APIRouter(prefix="/api", tags=["system"])


def _check_health(request: Request) -> CheckHealth:
    use_case: CheckHealth = request.app.state.container.check_health
    return use_case


@router.get("/health", response_model=Health, summary="Liveness and dependency status (always 200)")
async def health(use_case: Annotated[CheckHealth, Depends(_check_health)]) -> Health:
    return await use_case.execute()


@router.get(
    "/ready",
    response_model=Health,
    summary="Readiness: 503 when a configured dependency fails",
    responses={503: {"model": Health, "description": "A dependency is down"}},
)
async def ready(response: Response, use_case: Annotated[CheckHealth, Depends(_check_health)]) -> Health:
    result = await use_case.execute()
    if result.status != "ok":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return result
