"""Analysis API endpoints for multi-document analysis."""

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Paper, Project
from app.schemas.common import ApiResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analysis"])


class ContradictionPair(BaseModel):
    """A single contradiction between two papers."""

    paper_a_id: int
    paper_a_title: str
    paper_b_id: int
    paper_b_title: str
    claim: str
    position_a: str
    position_b: str
    confidence: float
    topic: str


class ContradictionResponse(BaseModel):
    """Response from contradiction detection."""

    contradictions: list[ContradictionPair]
    topics: list[str]
    total_contradictions: int


@router.post(
    "/contradictions",
    response_model=ApiResponse[ContradictionResponse],
    summary="Detect contradictions across project papers",
)
async def detect_contradictions(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Analyze all papers in a project to find contradictory claims or findings."""
    from app.api.deps import get_llm
    from app.services.contradiction_service import ContradictionService

    stmt = select(Paper).where(Paper.project_id == project_id)
    result = await db.execute(stmt)
    papers = result.scalars().all()

    if len(papers) < 2:
        return ApiResponse(
            data=ContradictionResponse(
                contradictions=[],
                topics=[],
                total_contradictions=0,
            )
        )

    papers_for_analysis = [
        {
            "paper_id": p.id,
            "title": p.title or "",
            "abstract": p.abstract or "",
        }
        for p in papers
    ]

    llm = get_llm()
    svc = ContradictionService(llm)
    result_data = await svc.detect_contradictions(papers_for_analysis)

    return ApiResponse(data=ContradictionResponse(**result_data))
