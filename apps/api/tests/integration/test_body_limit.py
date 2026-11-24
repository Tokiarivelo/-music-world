"""Request body size limit (Phase 8 security review): oversized bodies are refused before they are parsed."""

from collections.abc import AsyncIterator
from typing import Annotated

import pytest
from fastapi import FastAPI, File, Request, UploadFile
from httpx import ASGITransport, AsyncClient

from music_world.main import DEFAULT_BODY_LIMIT, UPLOAD_BODY_LIMIT, create_app
from music_world.shared.body_limit import BodySizeLimitMiddleware
from music_world.shared.settings import Settings
from tests.integration.test_http import LifespanManager, client_for

LIMIT = 1024


def _small_app() -> FastAPI:
    app = FastAPI()

    @app.post("/echo")
    async def echo(request: Request) -> dict[str, int]:
        return {"size": len(await request.body())}

    @app.post("/upload")
    async def upload(file: Annotated[UploadFile, File()]) -> dict[str, int]:
        return {"size": len(await file.read())}

    @app.get("/echo")
    async def read() -> dict[str, str]:
        return {"ok": "yes"}

    app.add_middleware(BodySizeLimitMiddleware, default_limit=LIMIT, path_limits={"/upload": 4 * LIMIT})
    return app


@pytest.fixture
async def small() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=_small_app()), base_url="http://test") as c:
        yield c


async def _chunks(total: int) -> AsyncIterator[bytes]:
    for _ in range(total // 256):
        yield b"x" * 256


async def test_body_under_the_limit_reaches_the_route(small: AsyncClient) -> None:
    response = await small.post("/echo", content=b"x" * LIMIT)
    assert response.status_code == 200
    assert response.json() == {"size": LIMIT}


async def test_declared_length_over_the_limit_is_413_with_the_uniform_error_body(small: AsyncClient) -> None:
    response = await small.post("/echo", content=b"x" * (LIMIT + 1))
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "REQUEST_TOO_LARGE"


async def test_streamed_body_without_length_is_cut_at_the_limit(small: AsyncClient) -> None:
    response = await small.post("/echo", content=_chunks(LIMIT * 8))
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "REQUEST_TOO_LARGE"


async def test_streamed_multipart_upload_is_cut_before_parsing(small: AsyncClient) -> None:
    boundary = "b0undary"
    head = f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\n\r\n'.encode()

    async def body() -> AsyncIterator[bytes]:
        yield head
        async for chunk in _chunks(LIMIT * 16):
            yield chunk

    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    response = await small.post("/upload", content=body(), headers=headers)
    assert response.status_code == 413


async def test_path_limit_allows_larger_uploads_on_that_path(small: AsyncClient) -> None:
    response = await small.post("/upload", files={"file": ("a.bin", b"x" * (2 * LIMIT))})
    assert response.status_code == 200
    assert response.json() == {"size": 2 * LIMIT}


async def test_invalid_content_length_is_refused(small: AsyncClient) -> None:
    response = await small.post("/echo", content=b"x", headers={"Content-Length": "abc"})
    assert response.status_code == 413


async def test_reads_are_not_limited(small: AsyncClient) -> None:
    assert (await small.get("/echo")).status_code == 200


async def test_the_app_limits_template_bodies_to_1_mb_and_uploads_to_26_mb() -> None:
    assert DEFAULT_BODY_LIMIT == 1024 * 1024
    assert 25 * 1024 * 1024 < UPLOAD_BODY_LIMIT <= 27 * 1024 * 1024
    c = await client_for("development")
    async with c, LifespanManager(c):
        response = await c.post("/api/templates", content=b"{" + b" " * DEFAULT_BODY_LIMIT + b"}")
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "REQUEST_TOO_LARGE"


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"session_cookie_secure": False}, "SESSION_COOKIE_SECURE"),
        ({"public_base_url": "http://mw.example"}, "PUBLIC_BASE_URL"),
    ],
)
def test_production_refuses_to_start_with_unsafe_settings(overrides: dict[str, object], message: str) -> None:
    values: dict[str, object] = {"app_env": "production", "public_base_url": "https://mw.example", **overrides}
    settings = Settings(**values)  # type: ignore[arg-type]
    with pytest.raises(RuntimeError, match=message):
        create_app(settings)


def test_unsafe_settings_are_allowed_outside_production() -> None:
    settings = Settings(app_env="development", session_cookie_secure=False, public_base_url="http://localhost:3000")
    assert settings.production_errors() == []
