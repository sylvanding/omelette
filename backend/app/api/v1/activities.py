"""Project activity feed API endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import ActivityLog, Project
from app.schemas.activity_log import ActivityRead
from app.schemas.common import ApiResponse, PaginatedData, PaginationParams

router = APIRouter(tags=["activities"])


@router.get("", response_model=ApiResponse[PaginatedData[ActivityRead]])
async def list_activities(
    project_id: int,
    pagination: PaginationParams = Depends(),
    action: str | None = Query(default=None, description="Filter by action type"),
    entity_type: str | None = Query(default=None, description="Filter by entity type"),
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    page, page_size = pagination.page, pagination.page_size

    base = select(ActivityLog).where(ActivityLog.project_id == project_id)
    count_base = select(func.count(ActivityLog.id)).where(ActivityLog.project_id == project_id)

    if action:
        base = base.where(ActivityLog.action == action)
        count_base = count_base.where(ActivityLog.action == action)
    if entity_type:
        base = base.where(ActivityLog.entity_type == entity_type)
        count_base = count_base.where(ActivityLog.entity_type == entity_type)

    total = (await db.execute(count_base)).scalar() or 0

    base = base.order_by(ActivityLog.created_at.desc()).limit(page_size).offset((page - 1) * page_size)
    result = await db.execute(base)
    items = result.scalars().all()

    return ApiResponse(
        data=PaginatedData(
            items=[ActivityRead.model_validate(a) for a in items],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=(total + page_size - 1) // page_size,
        )
    )
