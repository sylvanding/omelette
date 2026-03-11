"""Incremental subscription API endpoints."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Project, Subscription
from app.schemas.common import ApiResponse
from app.schemas.subscription import (
    SubscriptionCreate,
    SubscriptionRead,
    SubscriptionRunResult,
    SubscriptionUpdate,
)
from app.services.subscription_service import SubscriptionService

router = APIRouter(prefix="/projects/{project_id}/subscriptions", tags=["subscriptions"])


@router.get("/feeds", response_model=ApiResponse[list[dict]])
async def list_common_feeds():
    """Return common academic RSS feed templates."""
    return ApiResponse(data=SubscriptionService.get_common_feeds())


@router.post("/check-rss", response_model=ApiResponse[dict])
async def check_rss(
    project_id: int,
    feed_url: str = Query(..., description="RSS/Atom feed URL"),
    since_days: int = Query(7, ge=1, le=365),
):
    """Check an RSS feed for new entries since the given number of days."""
    service = SubscriptionService()
    since = datetime.now() - timedelta(days=since_days)
    entries = await service.check_rss_feed(feed_url, since)
    return ApiResponse(data={"entries": entries, "count": len(entries)})


@router.post("/check-updates", response_model=ApiResponse[dict])
async def check_updates(
    project_id: int,
    query: str = Query(""),
    sources: list[str] | None = None,
    since_days: int = Query(7, ge=1, le=365),
    max_results: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Check for new papers via API search (incremental update)."""
    service = SubscriptionService()
    result = await service.check_api_updates(query, sources, since_days, max_results)
    return ApiResponse(data=result)


@router.get("", response_model=ApiResponse[list[SubscriptionRead]])
async def list_subscriptions(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """List all subscriptions for a project."""
    result = await db.execute(select(Subscription).where(Subscription.project_id == project_id))
    subs = result.scalars().all()
    return ApiResponse(data=[SubscriptionRead.model_validate(s) for s in subs])


@router.post("", response_model=ApiResponse[SubscriptionRead], status_code=201)
async def create_subscription(
    project_id: int,
    body: SubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Create a new subscription."""
    sub = Subscription(project_id=project_id, **body.model_dump())
    db.add(sub)
    await db.flush()
    await db.refresh(sub)
    return ApiResponse(code=201, message="Subscription created", data=SubscriptionRead.model_validate(sub))


@router.get("/{sub_id}", response_model=ApiResponse[SubscriptionRead])
async def get_subscription(
    project_id: int,
    sub_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Get a subscription by ID."""
    sub = (
        await db.execute(select(Subscription).where(Subscription.id == sub_id, Subscription.project_id == project_id))
    ).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return ApiResponse(data=SubscriptionRead.model_validate(sub))


@router.put("/{sub_id}", response_model=ApiResponse[SubscriptionRead])
async def update_subscription(
    project_id: int,
    sub_id: int,
    body: SubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Update a subscription."""
    sub = (
        await db.execute(select(Subscription).where(Subscription.id == sub_id, Subscription.project_id == project_id))
    ).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    update_data = body.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(sub, k, v)
    await db.flush()
    await db.refresh(sub)
    return ApiResponse(data=SubscriptionRead.model_validate(sub))


@router.delete("/{sub_id}", response_model=ApiResponse[None])
async def delete_subscription(
    project_id: int,
    sub_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Delete a subscription."""
    sub = (
        await db.execute(select(Subscription).where(Subscription.id == sub_id, Subscription.project_id == project_id))
    ).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    await db.delete(sub)
    return ApiResponse(message="Subscription deleted", data=None)


@router.post("/{sub_id}/trigger", response_model=ApiResponse[SubscriptionRunResult])
async def trigger_subscription(
    project_id: int,
    sub_id: int,
    since_days: int = Query(7, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Manually trigger a subscription update (check API for new papers)."""
    sub = (
        await db.execute(select(Subscription).where(Subscription.id == sub_id, Subscription.project_id == project_id))
    ).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    service = SubscriptionService()
    result = await service.check_api_updates(
        query=sub.query,
        sources=sub.sources or None,
        since_days=since_days,
        max_results=sub.max_results,
    )
    new_papers = result.get("new_papers", [])
    total_found = result.get("total_found", 0)
    sources_checked = result.get("sources_checked", {})
    sub.last_run_at = datetime.now()
    sub.total_found = total_found
    await db.flush()
    await db.refresh(sub)
    return ApiResponse(
        data=SubscriptionRunResult(
            new_papers=len(new_papers),
            total_checked=total_found,
            sources_searched=list(sources_checked.keys()) if sources_checked else [],
        )
    )
