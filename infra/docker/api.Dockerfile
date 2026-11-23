# API and worker image (same image, different command). Build context: repository root.
FROM python:3.12-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.11.21 /uv /bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv PATH="/opt/venv/bin:$PATH"
WORKDIR /app

# Dependencies first (cached layer), then the code.
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/api/ ./
RUN uv sync --frozen --no-dev

RUN useradd --system --uid 10001 app && chown -R app /app
USER app
EXPOSE 8000
CMD ["uvicorn", "music_world.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
