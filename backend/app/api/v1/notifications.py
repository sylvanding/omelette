"""Notifications API: list, mark read, and dismiss in-app alerts."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Notification, Project
from app.schemas.common import ApiResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["notifications"])


# --- Response schemas ---


class NotificationItem(BaseModel):
    id: int
    project_id: int
    type: str
    title: str
    body: str
    paper_id: int | None = None
    subscription_id: int | None = None
    is_read: bool
    is_dismissed: bool
    created_at: str | None = None


class NotificationListResponse(BaseModel):
    items: list[NotificationItem]
    total: int
    unread_count: int


# --- Endpoints ---


@router.get(
    "",
    response_model=ApiResponse[NotificationListResponse],
    summary="List notifications for a project",
)
async def list_notifications(
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """List all notifications for the project, optionally filtering to unread only."""
    conditions = [
        Notification.project_id == project.id,
        ~Notification.is_dismissed,
    ]
    if unread_only:
        conditions.append(~Notification.is_read)

    stmt = select(Notification).where(*conditions).order_by(Notification.created_at.desc())
    result = await db.execute(stmt)
    notifications = result.scalars().all()

    unread_stmt = select(Notification).where(
        Notification.project_id == project.id,
        ~Notification.is_read,
        ~Notification.is_dismissed,
    )
    unread_result = await db.execute(unread_stmt)
    unread_count = len(unread_result.scalars().all())

    items = []
    for n in notifications:
        items.append(
            NotificationItem(
                id=n.id,
                project_id=n.project_id,
                type=n.type,
                title=n.title,
                body=n.body,
                paper_id=n.paper_id,
                subscription_id=n.subscription_id,
                is_read=n.is_read,
                is_dismissed=n.is_dismissed,
                created_at=n.created_at.isoformat() if n.created_at else None,
            )
        )

    return ApiResponse(data=NotificationListResponse(items=items, total=len(items), unread_count=unread_count))


@router.post(
    "/{notification_id}/read",
    response_model=ApiResponse[dict],
    summary="Mark a notification as read",
)
async def mark_notification_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Mark a specific notification as read."""
    stmt = select(Notification).where(
        Notification.id == notification_id,
        Notification.project_id == project.id,
    )
    result = await db.execute(stmt)
    notification = result.scalar_one_or_none()

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    await db.commit()
    return ApiResponse(data={"read": True})


@router.post(
    "/mark-all-read",
    response_model=ApiResponse[dict],
    summary="Mark all notifications as read",
)
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Mark all unread notifications for the project as read."""
    stmt = select(Notification).where(
        Notification.project_id == project.id,
        ~Notification.is_read,
    )
    result = await db.execute(stmt)
    notifications = result.scalars().all()

    for notification in notifications:
        notification.is_read = True

    await db.commit()
    return ApiResponse(data={"marked_count": len(notifications)})


@router.delete(
    "/{notification_id}",
    response_model=ApiResponse[dict],
    summary="Dismiss a notification",
)
async def dismiss_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Dismiss (soft-delete) a notification."""
    stmt = select(Notification).where(
        Notification.id == notification_id,
        Notification.project_id == project.id,
    )
    result = await db.execute(stmt)
    notification = result.scalar_one_or_none()

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_dismissed = True
    await db.commit()
    return ApiResponse(data={"dismissed": True})
