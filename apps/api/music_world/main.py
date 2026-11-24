"""FastAPI app factory. Run: `uvicorn music_world.main:create_app --factory`."""

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI

from music_world.accounts.interfaces import http as accounts_http
from music_world.analysis.interfaces import http as analysis_http
from music_world.director.interfaces import http as director_http
from music_world.projects.domain.project import MAX_AUDIO_BYTES, MAX_LRC_BYTES
from music_world.projects.interfaces import http as jobs_http
from music_world.projects.interfaces import projects_http
from music_world.shared.body_limit import BodySizeLimitMiddleware
from music_world.shared.container import Container, build_container
from music_world.shared.http import install_error_handlers
from music_world.shared.logging import configure_logging
from music_world.shared.settings import Settings, get_settings
from music_world.system.interfaces import http as system_http
from music_world.templates.interfaces import http as templates_http
from music_world.templates.interfaces import moderation_http

# Song upload = audio + optional .lrc + multipart overhead; every other body (templates, director demo analysis,
# thumbnails) is far below 1 MB. Caddy applies the same limits (infra/Caddyfile).
UPLOAD_BODY_LIMIT = MAX_AUDIO_BYTES + MAX_LRC_BYTES + 1024 * 1024
DEFAULT_BODY_LIMIT = 1024 * 1024


def create_app(
    settings: Settings | None = None, container_factory: Callable[[Settings], Container] = build_container
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    if errors := settings.production_errors():
        raise RuntimeError("unsafe production settings: " + "; ".join(errors))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        container = container_factory(settings)
        app.state.container = container
        try:
            yield
        finally:
            await container.close()

    app = FastAPI(
        title="Music World API",
        version=settings.app_version,
        lifespan=lifespan,
        docs_url="/api/docs" if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.docs_enabled else None,
    )
    install_error_handlers(app)
    app.add_middleware(
        BodySizeLimitMiddleware,
        default_limit=DEFAULT_BODY_LIMIT,
        path_limits={"/api/projects": UPLOAD_BODY_LIMIT},
    )
    app.include_router(system_http.router)
    app.include_router(jobs_http.router)
    app.include_router(projects_http.router)
    app.include_router(analysis_http.router)
    app.include_router(director_http.router)
    app.include_router(accounts_http.router)
    app.include_router(templates_http.router)
    app.include_router(moderation_http.router)
    if settings.app_env == "development":
        app.include_router(jobs_http.demo_router)
    return app
