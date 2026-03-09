"""Writing assistance API endpoints."""

from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/projects/{project_id}/writing", tags=["writing"])


class WritingAssistRequest(BaseModel):
    task: str  # summarize, cite, review_outline, gap_analysis
    text: str = ""
    paper_ids: list[int] | None = None
    style: str = "gb_t_7714"
    language: str = "en"


class WritingAssistResponse(BaseModel):
    content: str
    citations: list[dict] = []
    suggestions: list[str] = []


@router.post("/assist", response_model=ApiResponse[WritingAssistResponse])
async def writing_assist(
    project_id: int,
    body: WritingAssistRequest,
    db: AsyncSession = Depends(get_db),
):
    """AI-powered writing assistance: summarize, cite, outline, gap analysis."""
    # TODO: Implement in Phase 3
    return ApiResponse(data=WritingAssistResponse(
        content="Writing assistance not yet implemented.",
        citations=[],
        suggestions=[],
    ))


@router.post("/summarize", response_model=ApiResponse[dict])
async def summarize_papers(
    project_id: int,
    paper_ids: list[int],
    language: str = "en",
    db: AsyncSession = Depends(get_db),
):
    """Generate summaries for selected papers."""
    # TODO: Implement in Phase 3
    return ApiResponse(data={"summaries": [], "message": "Not yet implemented"})


@router.post("/citations", response_model=ApiResponse[dict])
async def generate_citations(
    project_id: int,
    paper_ids: list[int],
    style: str = "gb_t_7714",
    db: AsyncSession = Depends(get_db),
):
    """Generate formatted citations for selected papers."""
    # TODO: Implement in Phase 3
    return ApiResponse(data={"citations": [], "style": style})
