# syntax=docker/dockerfile:1
# API and worker image (same image, different command). Build context: repository root.
# Layer order = how often each input changes: system packages → dependencies (pyproject + lock) → model weights →
# code. A code change rebuilds only the last two small layers (no wheel or weight download).
FROM python:3.12-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.11.21 /uv /bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv PATH="/opt/venv/bin:$PATH"
WORKDIR /app

# ffprobe (upload checks) and ffmpeg (worker decode stage).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

RUN useradd --system --uid 10001 app && mkdir -p /data/storage /opt/models && chown app /data/storage /opt/models

# Dependencies first. The uv cache mount keeps downloaded wheels (torch CPU ~200 MB) between builds when the lock
# file changes; it is not part of the image.
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project

# Pre-download the Demucs weights (~80 MB) so the first analysis does not download them; Basic Pitch ships its ONNX
# model inside the package. Another DEMUCS_MODEL at run time is downloaded on first use. This layer sits before the
# code, so it is rebuilt only when the dependencies or DEMUCS_MODEL change. chown in the same RUN: no duplicate layer.
ARG DEMUCS_MODEL=htdemucs
ENV TORCH_HOME=/opt/models/torch
RUN python -c "from demucs.pretrained import get_model; get_model('${DEMUCS_MODEL}')" && chown -R app /opt/models

COPY --chown=app apps/api/ ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

USER app
EXPOSE 8000
CMD ["uvicorn", "music_world.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
