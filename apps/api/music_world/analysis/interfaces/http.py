"""`GET /api/projects/{id}/analysis`: the `music-world.analysis.v1` document of a project."""

import re
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request

from music_world.analysis.application.use_cases.get_project_analysis import GetProjectAnalysis
from music_world.projects.domain.errors import ProjectNotFoundError
from music_world.schemas import AnalysisResult
from music_world.shared.http import ERROR_RESPONSES

router = APIRouter(prefix="/api/projects", tags=["analysis"])

_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def _use_case(request: Request) -> GetProjectAnalysis:
    use_case: GetProjectAnalysis = request.app.state.container.get_project_analysis
    return use_case


@router.get(
    "/{project_id}/analysis",
    response_model=AnalysisResult,
    response_model_by_alias=True,
    summary="Get the analysis (notes, chords, tempo, key, energy, sections, lyrics) of a project",
    responses={404: ERROR_RESPONSES[404], 409: ERROR_RESPONSES[409]},
)
async def get_project_analysis(
    project_id: Annotated[str, Path(max_length=64)], use_case: Annotated[GetProjectAnalysis, Depends(_use_case)]
) -> AnalysisResult:
    if not _UUID.match(project_id):
        raise ProjectNotFoundError(f"project {project_id} not found")
    return await use_case.execute(project_id)
