"""Literature search API endpoints — multi-source federated search."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.common import ApiResponse, TaskResponse

router = APIRouter(prefix="/projects/{project_id}/search", tags=["search"])


@router.post("/execute", response_model=ApiResponse[TaskResponse])
async def execute_search(
    project_id: int,
    sources: list[str] | None = None,
    query: str | None = None,
    use_keywords: bool = True,
    max_results: int = 100,
    db: AsyncSession = Depends(get_db),
):
    """Execute a federated search across configured academic sources."""
    # TODO: Implement in Phase 1 — creates background task for multi-source search
    return ApiResponse(data=TaskResponse(task_id=0, status="pending", message="Search not yet implemented"))


@router.get("/sources", response_model=ApiResponse[list[dict]])
async def list_search_sources():
    """Return available search sources and their status."""
    return ApiResponse(data=[
        {"id": "semantic_scholar", "name": "Semantic Scholar", "status": "available", "api": True},
        {"id": "openalex", "name": "OpenAlex", "status": "available", "api": True},
        {"id": "arxiv", "name": "arXiv", "status": "available", "api": True},
        {"id": "crossref", "name": "Crossref", "status": "available", "api": True},
    ])
