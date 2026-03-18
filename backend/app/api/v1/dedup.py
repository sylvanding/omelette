"""Deduplication API endpoints."""

import logging
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_llm, get_project
from app.config import settings
from app.models import Paper, PaperStatus, Project
from app.schemas.common import ApiResponse
from app.schemas.knowledge_base import AutoResolveRequest, ResolveConflictRequest
from app.services.dedup_service import DedupService
from app.services.llm.client import LLMClient
from app.services.pdf_metadata import extract_metadata

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/dedup", tags=["dedup"])


@router.post("/run", response_model=ApiResponse[dict])
async def run_dedup(
    project_id: int,
    strategy: Literal["full", "doi_only", "title_only"] = "full",
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
    project: Project = Depends(get_project),
):
    """Run deduplication pipeline."""
    service = DedupService(db, llm)

    if strategy == "doi_only":
        result = await service.doi_hard_dedup(project_id)
    elif strategy == "title_only":
        result = await service.title_similarity_dedup(project_id)
    else:
        result = await service.run_full_dedup(project_id)

    return ApiResponse(data=result)


@router.get("/candidates", response_model=ApiResponse[list[dict]])
async def list_dedup_candidates(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """List potential duplicate pairs for manual review."""
    service = DedupService(db)
    candidates = await service.find_llm_dedup_candidates(project_id)
    return ApiResponse(data=candidates)


@router.post("/verify", response_model=ApiResponse[dict])
async def verify_duplicate(
    project_id: int,
    paper_a_id: int = Query(..., description="First paper ID"),
    paper_b_id: int = Query(..., description="Second paper ID"),
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
    project: Project = Depends(get_project),
):
    """Use LLM to verify if two papers are duplicates."""
    service = DedupService(db, llm)
    result = await service.llm_verify_duplicate(paper_a_id, paper_b_id)
    return ApiResponse(data=result)


@router.post("/resolve", response_model=ApiResponse[dict])
async def resolve_conflict(
    project_id: int,
    body: ResolveConflictRequest,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Resolve a single upload conflict: keep_old, keep_new, merge, or skip."""

    parts = body.conflict_id.split(":", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid conflict_id format")
    old_paper_id_str, saved_filename = parts
    if saved_filename != Path(saved_filename).name or ".." in saved_filename:
        raise HTTPException(status_code=400, detail="Invalid filename in conflict_id")
    try:
        old_paper_id = int(old_paper_id_str)
    except ValueError as err:
        raise HTTPException(status_code=400, detail="Invalid conflict_id format") from err

    old_paper = await db.get(Paper, old_paper_id)
    if not old_paper or old_paper.project_id != project_id:
        raise HTTPException(status_code=404, detail="Existing paper not found")

    if body.action == "keep_old":
        return ApiResponse(data={"action": "keep_old", "message": "Kept existing paper"})

    pdf_dir = Path(settings.pdf_dir)
    pdf_path = pdf_dir / str(project_id) / saved_filename
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Uploaded PDF file not found")

    if body.action in ("keep_new", "skip"):
        metadata = await extract_metadata(pdf_path, fallback_title="Untitled")
        paper = Paper(
            project_id=project_id,
            title=metadata.title,
            abstract=metadata.abstract,
            authors=metadata.authors,
            doi=metadata.doi,
            year=metadata.year,
            journal=metadata.journal,
            pdf_path=str(pdf_path),
            source=metadata.source,
            status=PaperStatus.PDF_DOWNLOADED,
        )
        db.add(paper)
        await db.flush()
        await db.refresh(paper)
        return ApiResponse(data={"action": body.action, "paper_id": paper.id, "message": "Created new paper"})

    if body.action == "merge" and body.merged_paper:
        merged = body.merged_paper
        paper = Paper(
            project_id=project_id,
            title=merged.get("title", old_paper.title),
            abstract=merged.get("abstract", old_paper.abstract),
            authors=merged.get("authors", old_paper.authors),
            doi=merged.get("doi", old_paper.doi),
            year=merged.get("year", old_paper.year),
            journal=merged.get("journal", old_paper.journal),
            pdf_path=str(pdf_path),
            source=merged.get("source", "pdf_upload"),
            status=PaperStatus.PDF_DOWNLOADED,
        )
        db.add(paper)
        await db.flush()
        await db.refresh(paper)
        return ApiResponse(data={"action": "merge", "paper_id": paper.id, "message": "Created merged paper"})

    raise HTTPException(status_code=400, detail=f"Invalid action: {body.action}")


@router.post("/auto-resolve", response_model=ApiResponse[list[dict]])
async def auto_resolve_conflicts(
    project_id: int,
    body: AutoResolveRequest,
    db: AsyncSession = Depends(get_db),
    llm: LLMClient = Depends(get_llm),
    project: Project = Depends(get_project),
):
    """Use LLM to suggest resolution for each conflict pair."""

    if not body.conflict_ids:
        return ApiResponse(data=[], message="No conflict_ids provided")

    pdf_dir = Path(settings.pdf_dir)
    resolutions = []

    for conflict_id in body.conflict_ids:
        parts = conflict_id.split(":", 1)
        if len(parts) != 2:
            resolutions.append({"conflict_id": conflict_id, "error": "Invalid format"})
            continue

        old_paper_id_str, saved_filename = parts
        if saved_filename != Path(saved_filename).name or ".." in saved_filename:
            resolutions.append({"conflict_id": conflict_id, "error": "Invalid filename"})
            continue
        try:
            old_paper_id = int(old_paper_id_str)
        except ValueError:
            resolutions.append({"conflict_id": conflict_id, "error": "Invalid format"})
            continue

        old_paper = await db.get(Paper, old_paper_id)
        if not old_paper or old_paper.project_id != project_id:
            resolutions.append({"conflict_id": conflict_id, "error": "Paper not found"})
            continue

        pdf_path = pdf_dir / str(project_id) / saved_filename
        if not pdf_path.exists():
            resolutions.append({"conflict_id": conflict_id, "error": "PDF not found"})
            continue

        new_metadata = await extract_metadata(pdf_path, fallback_title="Untitled")

        dedup_svc = DedupService(db, llm)
        resolution = await dedup_svc.resolve_conflict(
            old_paper=old_paper,
            new_title=new_metadata.title,
            new_doi=new_metadata.doi,
            new_year=new_metadata.year,
            new_journal=new_metadata.journal,
        )
        resolutions.append({"conflict_id": conflict_id, **resolution})

    return ApiResponse(data=resolutions)
