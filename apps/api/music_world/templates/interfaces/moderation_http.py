"""`/api/moderation`: review hidden templates (10-template-moderation requirements 1–3).

Every route answers 404 to anyone who is not a moderator, and to everyone when `MODERATOR_EMAILS` is empty.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response, status

from music_world.schemas.store import ModerationQueue, ModerationQueueItem
from music_world.shared.auth import ModeratorCaller, require_moderator
from music_world.shared.container import TemplateServices
from music_world.shared.errors import RateLimitedError
from music_world.shared.http import ERROR_RESPONSES
from music_world.templates.application.use_cases.moderation import QueuePage
from music_world.templates.domain.model import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PageCursor
from music_world.templates.interfaces.http import TemplateId, _contract

router = APIRouter(prefix="/api/moderation", tags=["moderation"], dependencies=[Depends(require_moderator)])

_DECISION: dict[int | str, dict[str, Any]] = {c: ERROR_RESPONSES[c] for c in (403, 404, 409, 429)}


def _services(request: Request) -> TemplateServices:
    services: TemplateServices = request.app.state.container.templates
    return services


Services = Annotated[TemplateServices, Depends(_services)]


def _queue(page: QueuePage) -> ModerationQueue:
    return ModerationQueue(
        items=[
            ModerationQueueItem.model_validate(
                {
                    "template": _contract(i.template).model_dump(by_alias=True),
                    "reportCount": len(i.reasons),
                    "reasons": i.reasons,
                    "lastReportedAt": i.last_reported_at,
                }
            )
            for i in page.items
        ],
        next_cursor=page.next_cursor.encode() if page.next_cursor else None,
    )


@router.get(
    "/templates",
    response_model=ModerationQueue,
    summary="Hidden templates with their report reasons, latest report first (moderators only; 404 otherwise)",
    responses={404: ERROR_RESPONSES[404]},
)
async def list_hidden(
    services: Services,
    cursor: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int | None, Query(ge=1, le=MAX_PAGE_SIZE)] = None,
) -> ModerationQueue:
    after = PageCursor.decode(cursor) if cursor else None
    page = await services.list_hidden.execute(after, limit or DEFAULT_PAGE_SIZE)
    return _queue(page)


def _limit(services: TemplateServices, caller: ModeratorCaller) -> None:
    if not services.moderation_limiter.allow(caller.rate_key):
        raise RateLimitedError("too many moderation actions, try again later")


@router.post(
    "/templates/{template_id}/restore",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Publish a wrongly hidden template again and forget its reports (409 when not hidden)",
    responses=_DECISION,
)
async def restore(template_id: TemplateId, services: Services, caller: ModeratorCaller) -> Response:
    _limit(services, caller)
    await services.restore.execute(template_id, caller.user_id or "")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/templates/{template_id}/remove",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete an abusive hidden template and its reports (409 when not hidden)",
    responses=_DECISION,
)
async def remove(template_id: TemplateId, services: Services, caller: ModeratorCaller) -> Response:
    _limit(services, caller)
    await services.remove.execute(template_id, caller.user_id or "")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
