"""`/api/projects`: upload a song (multipart) and read its analysis status."""

import re
import tempfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, UploadFile, status
from fastapi import Path as PathParam

from music_world.projects.application.use_cases.create_project import CreateProject
from music_world.projects.application.use_cases.get_project import GetProject
from music_world.projects.domain.errors import AudioTooLargeError, LyricsFileInvalidError, ProjectNotFoundError
from music_world.projects.domain.project import MAX_AUDIO_BYTES, MAX_LRC_BYTES
from music_world.projects.interfaces.mappers import project_to_contract
from music_world.schemas import Project, ProjectCreated
from music_world.shared.http import ERROR_RESPONSES

router = APIRouter(prefix="/api/projects", tags=["projects"])

UUID_PATTERN = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
_CHUNK = 1024 * 1024


def _create_project(request: Request) -> CreateProject:
    use_case: CreateProject = request.app.state.container.create_project
    return use_case


def _get_project(request: Request) -> GetProject:
    use_case: GetProject = request.app.state.container.get_project
    return use_case


@asynccontextmanager
async def _spooled(upload: UploadFile) -> AsyncIterator[Path]:
    """Streams the upload to a temporary file, stopping as soon as it exceeds the size limit."""
    with tempfile.TemporaryDirectory(prefix="mw-upload-") as tmp:
        path = Path(tmp) / "audio"
        size = 0
        with path.open("wb") as out:
            while chunk := await upload.read(_CHUNK):
                size += len(chunk)
                if size > MAX_AUDIO_BYTES:
                    raise AudioTooLargeError(f"audio file is larger than {MAX_AUDIO_BYTES // (1024 * 1024)} MB")
                out.write(chunk)
        yield path


async def _read_lrc(upload: UploadFile | None) -> bytes | None:
    if upload is None:
        return None
    data = await upload.read(MAX_LRC_BYTES + 1)
    if len(data) > MAX_LRC_BYTES:
        raise LyricsFileInvalidError(f"lyrics file is larger than {MAX_LRC_BYTES // 1024} KB")
    return data


@router.post(
    "",
    response_model=ProjectCreated,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload a song (MP3, WAV or FLAC, ≤ 25 MB, ≤ 3 min) and an optional .lrc; starts its analysis",
    responses={413: ERROR_RESPONSES[413], 415: ERROR_RESPONSES[415], 422: ERROR_RESPONSES[422]},
)
async def create_project(
    use_case: Annotated[CreateProject, Depends(_create_project)],
    audio: Annotated[UploadFile, File(description="MP3, WAV or FLAC; checked by content.")],
    lyrics: Annotated[UploadFile | None, File(description="Optional timed lyrics (.lrc, UTF-8).")] = None,
) -> ProjectCreated:
    lrc = await _read_lrc(lyrics)
    async with _spooled(audio) as path:
        created = await use_case.execute(path, lrc)
    return ProjectCreated(
        project_id=created.project.id,
        job_id=created.job.id if created.job else None,
        status="analyzing" if created.job else "ready",
    )


@router.get(
    "/{project_id}",
    response_model=Project,
    summary="Get a project and the progress of its analysis",
    responses={404: ERROR_RESPONSES[404]},
)
async def get_project(
    project_id: Annotated[str, PathParam(max_length=64)], use_case: Annotated[GetProject, Depends(_get_project)]
) -> Project:
    if not re.match(UUID_PATTERN, project_id):
        raise ProjectNotFoundError(f"project {project_id} not found")
    return project_to_contract(await use_case.execute(project_id))
