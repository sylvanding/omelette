"""Task status and management API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models import Task
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{task_id}", response_model=ApiResponse[dict])
async def get_task(task_id: int, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return ApiResponse(data={
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
    })


@router.get("", response_model=ApiResponse[list[dict]])
async def list_tasks(
    project_id: int | None = None,
    status: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Task).order_by(Task.created_at.desc()).limit(limit)
    if project_id:
        stmt = stmt.where(Task.project_id == project_id)
    if status:
        stmt = stmt.where(Task.status == status)
    result = await db.execute(stmt)
    tasks = result.scalars().all()
    return ApiResponse(data=[
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
    ])


@router.post("/{task_id}/cancel", response_model=ApiResponse)
async def cancel_task(task_id: int, db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status in ("completed", "failed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel task in {task.status} state")
    task.status = "cancelled"
    await db.flush()
    return ApiResponse(message="Task cancelled")
