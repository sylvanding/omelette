"""Audio overviews API: generate and manage conversational audio summaries of papers."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import AudioOverview, Paper, Project
from app.schemas.common import ApiResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["audio-overviews"])


# --- Request / Response schemas ---


class AudioOverviewCreate(BaseModel):
    paper_ids: list[int]
    tone: str = "conversational"
    focus_areas: list[str] = []


class DialogueEntry(BaseModel):
    speaker: str
    text: str


class AudioOverviewResponse(BaseModel):
    title: str
    duration_estimate: str
    summary: str
    script: list[DialogueEntry]
    paper_count: int


class AudioOverviewListItem(BaseModel):
    id: int
    title: str
    summary: str
    duration_estimate: str
    tone: str
    paper_count: int
    paper_ids: list[int]
    created_at: str | None = None


class AudioOverviewListResponse(BaseModel):
    items: list[AudioOverviewListItem]
    total: int


# --- Endpoint ---


@router.post(
    "",
    response_model=ApiResponse[AudioOverviewResponse],
    status_code=201,
    summary="Generate audio overview dialogue for selected papers",
)
async def generate_audio_overview(
    body: AudioOverviewCreate,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Generate a conversational dialogue script (audio overview) for selected papers."""
    from app.api.deps import get_llm
    from app.services.audio_overview_service import AudioOverviewService

    if not body.paper_ids:
        raise HTTPException(status_code=400, detail="Select at least one paper")

    if body.tone not in ("formal", "conversational"):
        raise HTTPException(
            status_code=400,
            detail="Tone must be 'formal' or 'conversational'",
        )

    # Fetch papers belonging to this project
    stmt = select(Paper).where(Paper.id.in_(body.paper_ids))
    result = await db.execute(stmt)
    papers = result.scalars().all()

    if not papers:
        raise HTTPException(status_code=404, detail="No papers found for the given IDs")

    paper_data = [
        {
            "title": p.title or "",
            "abstract": p.abstract or "",
            "authors": _parse_authors(p.authors),
            "year": p.year,
        }
        for p in papers
    ]

    llm = get_llm()
    svc = AudioOverviewService(llm)
    dialogue = await svc.generate_dialogue(
        papers=paper_data,
        tone=body.tone,
        focus_areas=body.focus_areas,
    )

    # Persist the generated overview
    overview = AudioOverview(
        project_id=project.id,
        title=dialogue.get("title", "Audio Overview"),
        summary=dialogue.get("summary", ""),
        duration_estimate=dialogue.get("duration_estimate", "Unknown"),
        tone=body.tone,
        focus_areas=json.dumps(body.focus_areas),
        paper_ids=json.dumps(body.paper_ids),
        paper_count=len(papers),
    )
    db.add(overview)
    await db.commit()
    await db.refresh(overview)

    return ApiResponse(
        data=AudioOverviewResponse(
            title=dialogue.get("title", "Audio Overview"),
            duration_estimate=dialogue.get("duration_estimate", "Unknown"),
            summary=dialogue.get("summary", ""),
            script=[DialogueEntry(speaker=e["speaker"], text=e["text"]) for e in dialogue.get("script", [])],
            paper_count=len(papers),
        )
    )


@router.get(
    "",
    response_model=ApiResponse[AudioOverviewListResponse],
    summary="List audio overviews for a project",
)
async def list_audio_overviews(
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """List all generated audio overviews for the project."""
    stmt = select(AudioOverview).where(AudioOverview.project_id == project.id).order_by(AudioOverview.created_at.desc())
    result = await db.execute(stmt)
    overviews = result.scalars().all()

    items = []
    for o in overviews:
        try:
            paper_ids = json.loads(o.paper_ids) if isinstance(o.paper_ids, str) else o.paper_ids
        except (json.JSONDecodeError, TypeError):
            paper_ids = []
        items.append(
            AudioOverviewListItem(
                id=o.id,
                title=o.title,
                summary=o.summary,
                duration_estimate=o.duration_estimate,
                tone=o.tone,
                paper_count=o.paper_count,
                paper_ids=paper_ids,
                created_at=o.created_at.isoformat() if o.created_at else None,
            )
        )

    return ApiResponse(data=AudioOverviewListResponse(items=items, total=len(items)))


@router.delete(
    "/{overview_id}",
    response_model=ApiResponse[dict],
    summary="Delete an audio overview",
)
async def delete_audio_overview(
    overview_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Delete a specific audio overview."""
    stmt = select(AudioOverview).where(
        AudioOverview.id == overview_id,
        AudioOverview.project_id == project.id,
    )
    result = await db.execute(stmt)
    overview = result.scalar_one_or_none()

    if not overview:
        raise HTTPException(status_code=404, detail="Audio overview not found")

    await db.delete(overview)
    await db.commit()
    return ApiResponse(data={"deleted": True})


def _parse_authors(authors_field: str | list | None) -> list[str]:
    """Parse authors field into a list of strings."""
    if isinstance(authors_field, list):
        return authors_field
    if isinstance(authors_field, str):
        return [a.strip() for a in authors_field.split(";") if a.strip()]
    return []
