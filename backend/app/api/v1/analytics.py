"""Analytics API for knowledge gap analysis."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Project
from app.schemas.common import ApiResponse

router = APIRouter(tags=["analytics"])


@router.get("/knowledge-gaps", response_model=ApiResponse[dict], summary="Identify knowledge gaps")
async def get_knowledge_gaps(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Identify underrepresented topics based on paper distribution."""
    from app.services.analytics_service import AnalyticsService

    svc = AnalyticsService(db)
    result = await svc.analyze_knowledge_gaps(project_id)
    return ApiResponse(data=result)
