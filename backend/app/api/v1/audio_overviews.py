"""Audio overviews API: generate conversational audio summaries of papers."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Paper, Project
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
    stmt = select(Paper).where(
        Paper.id.in_(body.paper_ids),
    )
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

    return ApiResponse(
        data=AudioOverviewResponse(
            title=dialogue.get("title", "Audio Overview"),
            duration_estimate=dialogue.get("duration_estimate", "Unknown"),
            summary=dialogue.get("summary", ""),
            script=[DialogueEntry(speaker=e["speaker"], text=e["text"]) for e in dialogue.get("script", [])],
            paper_count=len(papers),
        )
    )


def _parse_authors(authors_field: str | list | None) -> list[str]:
    """Parse authors field into a list of strings."""
    if isinstance(authors_field, list):
        return authors_field
    if isinstance(authors_field, str):
        return [a.strip() for a in authors_field.split(";") if a.strip()]
    return []
