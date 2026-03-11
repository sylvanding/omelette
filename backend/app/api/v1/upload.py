"""PDF upload API endpoints."""

import logging
import uuid
from difflib import SequenceMatcher
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.config import settings
from app.models import Paper, Project
from app.schemas.common import ApiResponse
from app.schemas.knowledge_base import DedupConflictPair, NewPaperData, UploadResult
from app.schemas.paper import PaperRead
from app.services.dedup_service import DedupService
from app.services.pdf_metadata import extract_metadata

logger = logging.getLogger(__name__)

router = APIRouter(tags=["papers"])

MAX_FILE_SIZE_MB = 50
TITLE_SIMILARITY_THRESHOLD = 0.85


@router.post("/upload", response_model=ApiResponse[UploadResult])
async def upload_pdfs(
    project_id: int,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Upload PDF files, extract metadata, and run dedup check against existing papers."""

    pdf_dir = Path(settings.pdf_dir)
    project_pdf_dir = pdf_dir / str(project_id)
    project_pdf_dir.mkdir(parents=True, exist_ok=True)

    max_bytes = MAX_FILE_SIZE_MB * 1024 * 1024
    papers: list[NewPaperData] = []
    conflicts: list[DedupConflictPair] = []
    total_uploaded = 0

    existing_papers_stmt = select(Paper).where(Paper.project_id == project_id)
    existing_result = await db.execute(existing_papers_stmt)
    existing_papers = list(existing_result.scalars().all())

    for upload_file in files:
        if not upload_file.filename or not upload_file.filename.lower().endswith(".pdf"):
            logger.warning("Skipping non-PDF file: %s", upload_file.filename)
            continue

        try:
            content = await upload_file.read()
            if len(content) > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"File {upload_file.filename} exceeds {MAX_FILE_SIZE_MB}MB limit",
                )

            safe_filename = Path(upload_file.filename or "upload.pdf").name.replace("..", "")
            saved_name = f"{uuid.uuid4().hex}_{safe_filename}"
            saved_path = project_pdf_dir / saved_name
            saved_path.write_bytes(content)
            total_uploaded += 1

            metadata = extract_metadata(saved_path, fallback_title=upload_file.filename)

            conflict_found = False

            for existing in existing_papers:
                if existing.doi and metadata.doi and existing.doi.lower() == metadata.doi.lower():
                    conflict_id = f"{existing.id}:{saved_name}"
                    conflicts.append(
                        DedupConflictPair(
                            conflict_id=conflict_id,
                            old_paper=PaperRead.model_validate(existing),
                            new_paper=metadata,
                            reason="doi_duplicate",
                            similarity=None,
                        )
                    )
                    conflict_found = True
                    break

                norm_existing = DedupService.normalize_title(existing.title)
                norm_new = DedupService.normalize_title(metadata.title)
                if norm_existing and norm_new:
                    sim = SequenceMatcher(None, norm_existing, norm_new).ratio()
                    if sim >= TITLE_SIMILARITY_THRESHOLD:
                        conflict_id = f"{existing.id}:{saved_name}"
                        conflicts.append(
                            DedupConflictPair(
                                conflict_id=conflict_id,
                                old_paper=PaperRead.model_validate(existing),
                                new_paper=metadata,
                                reason="title_similarity",
                                similarity=round(sim, 3),
                            )
                        )
                        conflict_found = True
                        break

            if not conflict_found:
                paper = Paper(
                    project_id=project_id,
                    title=metadata.title,
                    abstract=metadata.abstract or "",
                    authors=[{"name": a.name} for a in metadata.authors] if metadata.authors else [],
                    doi=metadata.doi or None,
                    year=metadata.year,
                    journal=metadata.journal or "",
                    source=metadata.source or "upload",
                    source_id="",
                    pdf_path=str(saved_path),
                    pdf_url="",
                    status="pdf_downloaded",
                    tags=[],
                    notes="",
                    citation_count=0,
                )
                db.add(paper)
                papers.append(metadata)

        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Failed to process %s: %s", upload_file.filename, e)
            raise HTTPException(status_code=422, detail=f"Invalid or corrupted PDF: {upload_file.filename}") from e

    await db.flush()

    return ApiResponse(
        data=UploadResult(
            papers=papers,
            conflicts=conflicts,
            total_uploaded=total_uploaded,
        )
    )
