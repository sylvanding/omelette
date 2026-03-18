"""Task status and management API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_or_404
from app.models import Task
from app.schemas.common import ApiResponse, PaginatedData

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{task_id}", response_model=ApiResponse[dict], summary="Get task by ID")
async def get_task(task_id: int, db: AsyncSession = Depends(get_db)):
    task = await get_or_404(db, Task, task_id, detail="Task not found")
    return ApiResponse(
        data={
            "id": task.id,
            "project_id": task.project_id,
            "task_type": task.task_type,
            "status": task.status,
            "progress": task.progress,
            "total": task.total,
            "params": task.params,
            "result": task.result,
            "error_message": task.error_message,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        }
    )


@router.get("", response_model=ApiResponse[PaginatedData[dict]], summary="List tasks")
async def list_tasks(
    project_id: int | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
):
    base = select(Task)
    if project_id:
        base = base.where(Task.project_id == project_id)
    if status:
        base = base.where(Task.status == status)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    result = await db.execute(base.order_by(Task.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    tasks = result.scalars().all()

    return ApiResponse(
        data=PaginatedData(
            items=[
                {
                    "id": t.id,
                    "project_id": t.project_id,
                    "task_type": t.task_type,
                    "status": t.status,
                    "progress": t.progress,
                    "total": t.total,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                }
                for t in tasks
            ],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=(total + page_size - 1) // page_size or 1,
        )
    )


@router.post("/{task_id}/cancel", response_model=ApiResponse, summary="Cancel task")
async def cancel_task(task_id: int, db: AsyncSession = Depends(get_db)):
    task = await get_or_404(db, Task, task_id, detail="Task not found")
    if task.status in ("completed", "failed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel task in {task.status} state")
    task.status = "cancelled"
    await db.flush()
    return ApiResponse(message="Task cancelled")
