"""Request body size limit (ASGI middleware), checked before FastAPI parses JSON or multipart bodies.

Starlette spools multipart file parts to disk without a size limit, so an oversized upload would fill the disk before
the upload route can reject it. This middleware refuses a declared `Content-Length` over the limit at once and stops
reading a streamed (chunked) body as soon as it goes over. Caddy enforces the same limits in production.
"""

from collections.abc import Mapping

from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_BODY_METHODS = frozenset({"POST", "PUT", "PATCH"})


def _too_large(limit: int) -> JSONResponse:
    message = f"request body is larger than {limit // 1024} KB"
    body = {"error": {"code": "REQUEST_TOO_LARGE", "message": message, "details": []}}
    return JSONResponse(status_code=413, content=body)


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, default_limit: int, path_limits: Mapping[str, int] | None = None) -> None:
        self._app, self._default = app, default_limit
        self._paths = dict(path_limits or {})

    def limit_for(self, path: str) -> int:
        return self._paths.get(path.rstrip("/") or "/", self._default)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in _BODY_METHODS:
            await self._app(scope, receive, send)
            return
        limit = self.limit_for(scope["path"])
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > limit):
            await _too_large(limit)(scope, receive, send)
            return

        received, exceeded, started = 0, False, False

        async def limited_receive() -> Message:
            nonlocal received, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    exceeded = True
                    raise HTTPException(status_code=413)  # FastAPI re-raises HTTPException from body parsing
            return message

        async def guarded_send(message: Message) -> None:
            nonlocal started
            if exceeded:
                return  # drop the app's own error response: the uniform 413 below replaces it
            started = True
            await send(message)

        try:
            await self._app(scope, limited_receive, guarded_send)
        except Exception:
            if not exceeded:
                raise
        if exceeded and not started:
            await _too_large(limit)(scope, receive, send)
