"""`GET /api/projects/{id}/analysis`: the `music-world.analysis.v1` document of a project."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from music_world.analysis.application.use_cases.get_project_analysis import GetProjectAnalysis
from music_world.projects.domain.job_kinds import SEARCH_LYRICS_JOB_KIND
from music_world.schemas import AnalysisResult, ProjectCreated
from music_world.shared.auth import AccessibleProjectId
from music_world.shared.http import ERROR_RESPONSES

router = APIRouter(prefix="/api/projects", tags=["analysis"])


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
    project_id: AccessibleProjectId, use_case: Annotated[GetProjectAnalysis, Depends(_use_case)]
) -> AnalysisResult:
    return await use_case.execute(project_id)


@router.post(
    "/{project_id}/lyrics-search",
    response_model=ProjectCreated,
    response_model_by_alias=True,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Search the lyrics of an analysed project (online catalog, then speech recognition) as a background job",
    responses={404: ERROR_RESPONSES[404], 409: ERROR_RESPONSES[409]},
)
async def search_project_lyrics(
    project_id: AccessibleProjectId,
    request: Request,
    use_case: Annotated[GetProjectAnalysis, Depends(_use_case)],
) -> ProjectCreated:
    await use_case.execute(project_id)  # 404 for an unknown project, 409 while the analysis is not ready
    job = await request.app.state.container.enqueue_job.execute(SEARCH_LYRICS_JOB_KIND, subject_id=project_id)
    return ProjectCreated(project_id=project_id, job_id=job.id, status="analyzing")
