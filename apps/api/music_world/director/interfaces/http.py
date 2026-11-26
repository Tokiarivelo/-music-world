"""Director routes: provider list, generate for a project, generate for the shipped demo song."""

from dataclasses import asdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Request

from music_world.director.application.use_cases.direct_layout import (
    DirectDemoLayout,
    DirectedLayout,
    DirectLayout,
)
from music_world.director.application.use_cases.generate_world import (
    GenerateDemoWorld,
    GeneratedWorld,
    GenerateProjectWorld,
)
from music_world.director.application.use_cases.list_providers import ListProviders
from music_world.director.domain.errors import RateLimitedError
from music_world.schemas.director import (
    DemoDirectorRequest,
    DemoLayoutRequest,
    DirectorProviders,
    DirectorRequest,
    DirectorResult,
    LayoutRequest,
    LayoutResult,
)
from music_world.shared.auth import AccessibleProjectId, Caller, CurrentCaller
from music_world.shared.http import ERROR_RESPONSES
from music_world.shared.rate_limit import SlidingWindowLimiter

router = APIRouter(prefix="/api", tags=["director"])

_RESPONSES: dict[int | str, dict[str, Any]] = {422: ERROR_RESPONSES[422], 429: ERROR_RESPONSES[429]}


def _rate_limit(request: Request, caller: Caller) -> None:
    limiter: SlidingWindowLimiter = request.app.state.container.director.limiter
    if not limiter.allow(caller.rate_key):  # per user when signed in, per client IP otherwise
        raise RateLimitedError("too many world generations, try again later")


def _project_use_case(request: Request, caller: CurrentCaller, _: AccessibleProjectId) -> GenerateProjectWorld:
    _rate_limit(request, caller)
    use_case: GenerateProjectWorld = request.app.state.container.director.generate_project_world
    return use_case


def _demo_use_case(request: Request, caller: CurrentCaller) -> GenerateDemoWorld:
    _rate_limit(request, caller)
    use_case: GenerateDemoWorld = request.app.state.container.director.generate_demo_world
    return use_case


def _list(request: Request) -> ListProviders:
    use_case: ListProviders = request.app.state.container.director.list_providers
    return use_case


def _result(world: GeneratedWorld) -> DirectorResult:
    return DirectorResult.model_validate(
        {
            "template": world.template,
            "provider": world.provider,
            "model": world.model,
            "requestedProvider": world.requested_provider,
            "cached": world.cached,
            "fallbacks": [asdict(step) for step in world.fallbacks],
        }
    )


@router.get(
    "/director/providers",
    response_model=DirectorProviders,
    summary="List the AI World Director providers and which ones are configured",
)
async def list_providers(use_case: Annotated[ListProviders, Depends(_list)]) -> DirectorProviders:
    result = use_case.execute()
    return DirectorProviders.model_validate(
        {"default": result.default, "providers": [asdict(p) for p in result.providers]}
    )


@router.post(
    "/projects/{project_id}/director",
    response_model=DirectorResult,
    response_model_by_alias=True,
    summary="Generate a world template for a project with the AI World Director",
    responses={404: ERROR_RESPONSES[404], 409: ERROR_RESPONSES[409], **_RESPONSES},
)
async def generate_for_project(
    project_id: Annotated[str, Path(max_length=64)],
    body: DirectorRequest,
    use_case: Annotated[GenerateProjectWorld, Depends(_project_use_case)],
) -> DirectorResult:
    return _result(await use_case.execute(project_id, body.provider))


@router.post(
    "/director/demo",
    response_model=DirectorResult,
    response_model_by_alias=True,
    summary="Generate a world template for the shipped demo song",
    responses=_RESPONSES,
)
async def generate_for_demo(
    body: DemoDirectorRequest, use_case: Annotated[GenerateDemoWorld, Depends(_demo_use_case)]
) -> DirectorResult:
    return _result(await use_case.execute(body.analysis, body.provider))


def _layout_use_case(request: Request, caller: CurrentCaller, _: AccessibleProjectId) -> DirectLayout:
    _rate_limit(request, caller)
    use_case: DirectLayout = request.app.state.container.director.direct_layout
    return use_case


def _layout_result(directed: DirectedLayout) -> LayoutResult:
    return LayoutResult.model_validate(
        {
            "layout": directed.layout.model_dump(by_alias=True),
            "provider": directed.provider,
            "model": directed.model,
            "requestedProvider": directed.requested_provider,
            "fallbacks": [asdict(step) for step in directed.fallbacks],
        }
    )


@router.post(
    "/projects/{project_id}/layout",
    response_model=LayoutResult,
    response_model_by_alias=True,
    summary="Write the object layout of the template the user chose with the AI World Director",
    responses={404: ERROR_RESPONSES[404], 409: ERROR_RESPONSES[409], **_RESPONSES},
)
async def direct_layout(
    project_id: Annotated[str, Path(max_length=64)],
    body: LayoutRequest,
    use_case: Annotated[DirectLayout, Depends(_layout_use_case)],
) -> LayoutResult:
    template = body.template.model_dump(by_alias=True, exclude_none=True)
    return _layout_result(await use_case.execute(project_id, template, body.provider))


def _demo_layout_use_case(request: Request, caller: CurrentCaller) -> DirectDemoLayout:
    _rate_limit(request, caller)
    use_case: DirectDemoLayout = request.app.state.container.director.direct_demo_layout
    return use_case


@router.post(
    "/director/layout/demo",
    response_model=LayoutResult,
    response_model_by_alias=True,
    summary="Write the object layout of the chosen template for the shipped demo song",
    responses=_RESPONSES,
)
async def direct_demo_layout(
    body: DemoLayoutRequest, use_case: Annotated[DirectDemoLayout, Depends(_demo_layout_use_case)]
) -> LayoutResult:
    template = body.template.model_dump(by_alias=True, exclude_none=True)
    return _layout_result(await use_case.execute(body.analysis, template, body.provider))
