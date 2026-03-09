"""Incremental subscription API endpoints."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.common import ApiResponse
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
