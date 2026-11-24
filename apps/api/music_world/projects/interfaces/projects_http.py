"""`/api/projects`: upload a song (multipart) and read its analysis status."""

import tempfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status

from music_world.projects.application.use_cases.create_project import CreateProject
from music_world.projects.application.use_cases.get_project import GetProject
from music_world.projects.application.use_cases.get_project_audio import GetProjectAudio
from music_world.projects.domain.errors import AudioTooLargeError, LyricsFileInvalidError
from music_world.projects.domain.project import MAX_AUDIO_BYTES, MAX_LRC_BYTES
from music_world.projects.interfaces.mappers import project_to_contract
from music_world.schemas import Project, ProjectCreated
from music_world.shared.auth import AccessibleProjectId, CurrentCaller
from music_world.shared.errors import RateLimitedError
from music_world.shared.http import ERROR_RESPONSES
from music_world.shared.rate_limit import SlidingWindowLimiter

router = APIRouter(prefix="/api/projects", tags=["projects"])

_CHUNK = 1024 * 1024


def _create_project(request: Request) -> CreateProject:
    use_case: CreateProject = request.app.state.container.create_project
    return use_case


def _get_project_audio(request: Request) -> GetProjectAudio:
    use_case: GetProjectAudio = request.app.state.container.get_project_audio
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
    responses={code: ERROR_RESPONSES[code] for code in (403, 413, 415, 422, 429)},
)
async def create_project(
    use_case: Annotated[CreateProject, Depends(_create_project)],
    caller: CurrentCaller,
    request: Request,
    audio: Annotated[UploadFile, File(description="MP3, WAV or FLAC; checked by content.")],
    lyrics: Annotated[UploadFile | None, File(description="Optional timed lyrics (.lrc, UTF-8).")] = None,
) -> ProjectCreated:
    limiter: SlidingWindowLimiter = request.app.state.container.upload_limiter
    if not limiter.allow(caller.rate_key):  # per user when signed in, per client IP otherwise
        raise RateLimitedError("too many songs uploaded, try again later")
    lrc = await _read_lrc(lyrics)
    async with _spooled(audio) as path:
        created = await use_case.execute(path, lrc, owner_id=caller.user_id)
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
    project_id: AccessibleProjectId, use_case: Annotated[GetProject, Depends(_get_project)]
) -> Project:
    return project_to_contract(await use_case.execute(project_id))


@router.get(
    "/{project_id}/audio",
    response_class=Response,
    summary="Download the uploaded audio of a project (for playback)",
    responses={200: {"content": {"audio/mpeg": {}, "audio/wav": {}, "audio/flac": {}}}, 404: ERROR_RESPONSES[404]},
)
async def get_project_audio(
    project_id: AccessibleProjectId,
    use_case: Annotated[GetProjectAudio, Depends(_get_project_audio)],
) -> Response:
    audio = await use_case.execute(project_id)
    # Content-addressed audio never changes: cache it for a day in the browser.
    return Response(audio.data, media_type=audio.content_type, headers={"Cache-Control": "private, max-age=86400"})
