"""PDF crawler API endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.common import ApiResponse, TaskResponse

router = APIRouter(prefix="/projects/{project_id}/crawl", tags=["crawler"])


@router.post("/start", response_model=ApiResponse[TaskResponse])
async def start_crawl(
    project_id: int,
    priority: str = "high",
    max_papers: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Start PDF download for papers without local PDFs."""
    # TODO: Implement in Phase 2
    return ApiResponse(data=TaskResponse(task_id=0, status="pending", message="Crawl not yet implemented"))


@router.get("/stats", response_model=ApiResponse[dict])
async def crawl_stats(project_id: int, db: AsyncSession = Depends(get_db)):
    """Return download statistics for the project."""
    # TODO: Implement in Phase 2
    return ApiResponse(data={"total": 0, "downloaded": 0, "failed": 0, "pending": 0})
