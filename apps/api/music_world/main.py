"""FastAPI app factory. Run: `uvicorn music_world.main:create_app --factory`."""

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI

from music_world.projects.interfaces import http as jobs_http
from music_world.shared.container import Container, build_container
from music_world.shared.http import install_error_handlers
from music_world.shared.logging import configure_logging
from music_world.shared.settings import Settings, get_settings
from music_world.system.interfaces import http as system_http


def create_app(
    settings: Settings | None = None, container_factory: Callable[[Settings], Container] = build_container
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

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
    app.include_router(system_http.router)
    app.include_router(jobs_http.router)
    if settings.app_env == "development":
        app.include_router(jobs_http.demo_router)
    return app
