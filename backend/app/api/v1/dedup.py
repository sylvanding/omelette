"""Deduplication API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_llm
from app.models import Project
from app.schemas.common import ApiResponse
from app.services.dedup_service import DedupService
from app.services.llm_client import LLMClient

router = APIRouter(prefix="/projects/{project_id}/dedup", tags=["dedup"])


async def _ensure_project(project_id: int, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/run", response_model=ApiResponse[dict])
async def run_dedup(
    project_id: int,
    strategy: str = "full",
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
):
    """Run deduplication pipeline."""
    await _ensure_project(project_id, db)
    service = DedupService(db, llm)

    if strategy == "doi_only":
        result = await service.doi_hard_dedup(project_id)
    elif strategy == "title_only":
        result = await service.title_similarity_dedup(project_id)
    else:
        result = await service.run_full_dedup(project_id)

    return ApiResponse(data=result)


@router.get("/candidates", response_model=ApiResponse[list[dict]])
async def list_dedup_candidates(project_id: int, db: AsyncSession = Depends(get_db)):
    """List potential duplicate pairs for manual review."""
    await _ensure_project(project_id, db)
    service = DedupService(db)
    candidates = await service.find_llm_dedup_candidates(project_id)
    return ApiResponse(data=candidates)


@router.post("/verify", response_model=ApiResponse[dict])
async def verify_duplicate(
    project_id: int,
    paper_a_id: int = Query(..., description="First paper ID"),
    paper_b_id: int = Query(..., description="Second paper ID"),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
):
    """Use LLM to verify if two papers are duplicates."""
    await _ensure_project(project_id, db)
    service = DedupService(db, llm)
    result = await service.llm_verify_duplicate(paper_a_id, paper_b_id)
    return ApiResponse(data=result)
