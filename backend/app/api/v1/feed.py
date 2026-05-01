"""Personalized research feed endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_or_404
from app.models import Paper, Project
from app.services.feed_service import FeedService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["feed"])


class FeedbackRequest(BaseModel):
    feedback: str  # "like" or "dislike"


class FeedbackResponse(BaseModel):
    paper_id: int
    feedback: str
    previous_score: float
    adjusted_score: float
    acknowledged: bool


@router.get("/recommendations")
async def get_feed(
    project_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return personalized paper recommendations for the project."""
    from app.services.llm.client import get_llm_client

    stmt = select(Project).where(Project.id == project_id).options(selectinload(Project.keywords))
    result = await db.execute(stmt)
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    stmt = select(Paper).where(Paper.project_id == project_id)
    result = await db.execute(stmt)
    papers = result.scalars().all()

    paper_dicts = [
        {
            "paper_id": p.id,
            "title": p.title or "",
            "abstract": p.abstract or "",
            "authors": p.authors or [],
        }
        for p in papers
    ]

    reading_history = [
        {
            "title": p.title or "",
            "read_time_seconds": getattr(p, "total_read_time_seconds", 0),
        }
        for p in papers
        if getattr(p, "status", None) == "read"
    ]

    liked_ids = [p.id for p in papers if getattr(p, "liked", False)]
    keywords = [k.keyword for k in project.keywords] if project.keywords else []

    svc = FeedService(get_llm_client())
    recommendations = await svc.get_feed(
        papers=paper_dicts,
        reading_history=reading_history,
        liked_paper_ids=liked_ids,
        keywords=keywords,
        recent_activity=[],
    )

    return {"code": 200, "message": "ok", "data": {"recommendations": recommendations, "total": len(recommendations)}}


@router.post("/refresh")
async def refresh_feed(
    project_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Force recalculation of the personalized feed."""
    from app.services.llm.client import get_llm_client

    stmt = select(Project).where(Project.id == project_id).options(selectinload(Project.keywords))
    result = await db.execute(stmt)
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    stmt = select(Paper).where(Paper.project_id == project_id)
    result = await db.execute(stmt)
    papers = result.scalars().all()

    paper_dicts = [
        {
            "paper_id": p.id,
            "title": p.title or "",
            "abstract": p.abstract or "",
            "authors": p.authors or [],
        }
        for p in papers
    ]

    reading_history = [
        {
            "title": p.title or "",
            "read_time_seconds": getattr(p, "total_read_time_seconds", 0),
        }
        for p in papers
        if getattr(p, "status", None) == "read"
    ]

    liked_ids = [p.id for p in papers if getattr(p, "liked", False)]
    keywords = [k.keyword for k in project.keywords] if project.keywords else []

    svc = FeedService(get_llm_client())
    recommendations = await svc.get_feed(
        papers=paper_dicts,
        reading_history=reading_history,
        liked_paper_ids=liked_ids,
        keywords=keywords,
        recent_activity=[],
    )

    return {
        "code": 200,
        "message": "feed refreshed",
        "data": {"recommendations": recommendations, "total": len(recommendations)},
    }


@router.post("/{paper_id}/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    project_id: int,
    paper_id: int,
    body: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Submit feedback on a recommended paper."""
    from app.services.feed_service import FeedService

    await get_or_404(db, Project, project_id)

    if body.feedback.lower() not in ("like", "dislike"):
        raise HTTPException(status_code=400, detail="Feedback must be 'like' or 'dislike'")

    svc = FeedService(None)  # No LLM needed for feedback
    result = await svc.submit_feedback(
        paper_id=paper_id,
        feedback=body.feedback,
        previous_score=0.5,
    )

    return result
