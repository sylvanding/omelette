"""Deduplication API endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.common import ApiResponse, TaskResponse

router = APIRouter(prefix="/projects/{project_id}/dedup", tags=["dedup"])


@router.post("/run", response_model=ApiResponse[TaskResponse])
async def run_dedup(
    project_id: int,
    strategy: str = "full",
    db: AsyncSession = Depends(get_db),
):
    """Run deduplication pipeline: DOI hard dedup -> title similarity -> LLM verification."""
    # TODO: Implement in Phase 1
    return ApiResponse(data=TaskResponse(task_id=0, status="pending", message="Dedup not yet implemented"))


@router.get("/candidates", response_model=ApiResponse[list[dict]])
async def list_dedup_candidates(project_id: int, db: AsyncSession = Depends(get_db)):
    """List potential duplicate pairs for manual review."""
    # TODO: Implement in Phase 1
    return ApiResponse(data=[])
