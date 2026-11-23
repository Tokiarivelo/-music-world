"""Uniform error body `{ "error": { "code", "message", "details" } }` and FastAPI exception handlers."""

from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from music_world.shared.errors import MusicWorldError, NotFoundError

log = structlog.get_logger(__name__)


class ErrorDetail(BaseModel):
    code: str = Field(examples=["JOB_NOT_FOUND"])
    message: str
    details: list[dict[str, Any]] = Field(default_factory=list)


class ErrorBody(BaseModel):
    error: ErrorDetail


ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    404: {"model": ErrorBody, "description": "Not found"},
    409: {"model": ErrorBody, "description": "Conflict"},
    422: {"model": ErrorBody, "description": "Invalid request"},
}

# Domain error codes that are not 409 by default.
_STATUS_BY_CODE: dict[str, int] = {"JOB_KIND_UNKNOWN": 422, "JOB_INVALID_PROGRESS": 422}


def _body(code: str, message: str, details: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return ErrorBody(error=ErrorDetail(code=code, message=message, details=details or [])).model_dump()


def status_for(error: MusicWorldError) -> int:
    if isinstance(error, NotFoundError):
        return 404
    return _STATUS_BY_CODE.get(error.code, 409)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(MusicWorldError)
    async def _domain(_: Request, exc: MusicWorldError) -> JSONResponse:
        return JSONResponse(status_code=status_for(exc), content=_body(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [{"loc": list(e.get("loc", [])), "msg": e.get("msg", "")} for e in exc.errors()]
        return JSONResponse(status_code=422, content=_body("REQUEST_INVALID", "Invalid request", details))

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        log.exception("http.unhandled_error", error_type=type(exc).__name__)
        return JSONResponse(status_code=500, content=_body("INTERNAL_ERROR", "Internal server error"))
