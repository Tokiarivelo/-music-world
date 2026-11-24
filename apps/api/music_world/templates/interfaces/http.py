"""`/api/templates`: the template store (06-template-store requirements 3, 4). Templates are data, never executed."""

import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Path, Query, Request, Response, UploadFile, status

from music_world.schemas.store import CreateStoreTemplateRequest, StoreTemplatePage
from music_world.schemas.store import StoreTemplate as StoreTemplateContract
from music_world.shared.auth import CurrentCaller, SignedInCaller
from music_world.shared.container import TemplateServices
from music_world.shared.errors import RateLimitedError
from music_world.shared.http import ERROR_RESPONSES
from music_world.templates.application.use_cases.store import CreateTemplateCommand
from music_world.templates.domain.errors import StoreTemplateNotFoundError, TemplateInvalidError, ThumbnailTooLargeError
from music_world.templates.domain.model import MAX_PAGE_SIZE, StoreTemplate, TemplatePage
from music_world.templates.domain.specification import MAX_TEMPLATE_BYTES
from music_world.templates.domain.thumbnail import MAX_THUMBNAIL_BYTES

router = APIRouter(prefix="/api/templates", tags=["templates"])

_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_MAX_BODY_BYTES = MAX_TEMPLATE_BYTES * 2


def _services(request: Request) -> TemplateServices:
    services: TemplateServices = request.app.state.container.templates
    return services


Services = Annotated[TemplateServices, Depends(_services)]


def _template_id(template_id: Annotated[str, Path(max_length=64)]) -> str:
    if not _UUID.match(template_id):
        raise StoreTemplateNotFoundError(f"template {template_id} not found")
    return template_id.lower()


TemplateId = Annotated[str, Depends(_template_id)]


def _contract(t: StoreTemplate) -> StoreTemplateContract:
    thumbnail = None
    if t.thumbnail_key:
        version = t.thumbnail_key.rsplit("/", 1)[-1].split(".", 1)[0][:8]
        thumbnail = f"/api/templates/{t.id}/thumbnail?v={version}"
    return StoreTemplateContract.model_validate(
        {
            "id": t.id,
            "template": t.document,
            "status": t.status.value,
            "author": {"displayName": t.author_name},
            "featured": t.featured,
            "thumbnailUrl": thumbnail,
            "createdAt": t.created_at,
            "publishedAt": t.published_at,
        }
    )


def _page(page: TemplatePage) -> StoreTemplatePage:
    return StoreTemplatePage(items=[_contract(t) for t in page.items], next_cursor=page.next_cursor)


_WRITE: dict[int | str, dict[str, Any]] = {c: ERROR_RESPONSES[c] for c in (401, 403, 404)}


@router.get(
    "",
    response_model=StoreTemplatePage,
    summary="List published templates, newest first (launch templates first); public",
)
async def list_templates(
    services: Services,
    cursor: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int | None, Query(ge=1, le=MAX_PAGE_SIZE)] = None,
) -> StoreTemplatePage:
    return _page(await services.list_published.execute(cursor, limit))


@router.get(
    "/mine",
    response_model=StoreTemplatePage,
    summary="The caller's own templates (drafts and published)",
    responses={401: ERROR_RESPONSES[401]},
)
async def list_mine(services: Services, caller: SignedInCaller) -> StoreTemplatePage:
    return _page(await services.list_mine.execute(caller.user_id or ""))


@router.post(
    "",
    response_model=StoreTemplateContract,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a template (draft, or published with `publish: true`); validated against the template contract",
    responses={**_WRITE, 413: ERROR_RESPONSES[413], 422: ERROR_RESPONSES[422], 429: ERROR_RESPONSES[429]},
)
async def create_template(
    body: CreateStoreTemplateRequest, request: Request, services: Services, caller: SignedInCaller
) -> StoreTemplateContract:
    size = int(request.headers.get("content-length") or 0)
    if size > _MAX_BODY_BYTES:
        raise TemplateInvalidError("template is invalid", details=[{"loc": ["template"], "msg": "too large"}])
    if not services.publish_limiter.allow(caller.rate_key):
        raise RateLimitedError("too many templates submitted, try again later")
    command = CreateTemplateCommand(
        owner_id=caller.user_id or "",
        author_name=caller.display_name or "",
        template=body.template,
        publish=body.publish,
        raw_size=size,
    )
    return _contract(await services.create.execute(command))


@router.get(
    "/{template_id}",
    response_model=StoreTemplateContract,
    summary="Get a published template (or one of the caller's own drafts)",
    responses={404: ERROR_RESPONSES[404]},
)
async def get_template(template_id: TemplateId, services: Services, caller: CurrentCaller) -> StoreTemplateContract:
    return _contract(await services.get.execute(template_id, caller.user_id))


@router.post(
    "/{template_id}/publish",
    response_model=StoreTemplateContract,
    summary="Publish one of the caller's drafts",
    responses=_WRITE,
)
async def publish_template(
    template_id: TemplateId, services: Services, caller: SignedInCaller
) -> StoreTemplateContract:
    return _contract(await services.publish.execute(template_id, caller.user_id or ""))


@router.put(
    "/{template_id}/thumbnail",
    response_model=StoreTemplateContract,
    summary="Attach a thumbnail (PNG, JPEG or WebP, ≤ 128 KB, ≤ 640 × 640 px) to one of the caller's templates",
    responses={**_WRITE, 413: ERROR_RESPONSES[413], 415: ERROR_RESPONSES[415], 422: ERROR_RESPONSES[422]},
)
async def put_thumbnail(
    template_id: TemplateId,
    services: Services,
    caller: SignedInCaller,
    image: Annotated[UploadFile, File(description="PNG, JPEG or WebP; checked by content.")],
) -> StoreTemplateContract:
    data = await image.read(MAX_THUMBNAIL_BYTES + 1)
    if len(data) > MAX_THUMBNAIL_BYTES:
        raise ThumbnailTooLargeError(f"thumbnail is larger than {MAX_THUMBNAIL_BYTES // 1024} KB")
    return _contract(await services.set_thumbnail.execute(template_id, caller.user_id or "", data))


@router.get(
    "/{template_id}/thumbnail",
    response_class=Response,
    summary="Download the thumbnail of a template",
    responses={200: {"content": {"image/png": {}, "image/jpeg": {}, "image/webp": {}}}, 404: ERROR_RESPONSES[404]},
)
async def get_thumbnail(template_id: TemplateId, services: Services, caller: CurrentCaller) -> Response:
    thumbnail = await services.get_thumbnail.execute(template_id, caller.user_id)
    headers = {"Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff"}
    return Response(thumbnail.data, media_type=thumbnail.content_type, headers=headers)


@router.delete(
    "/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete one of the caller's templates",
    responses=_WRITE,
)
async def delete_template(template_id: TemplateId, services: Services, caller: SignedInCaller) -> Response:
    await services.delete.execute(template_id, caller.user_id or "")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
