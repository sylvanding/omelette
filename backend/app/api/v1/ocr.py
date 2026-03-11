"""OCR processing API endpoints."""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Paper, PaperChunk, PaperStatus, Project
from app.schemas.common import ApiResponse
from app.services.ocr_service import OCRService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/ocr", tags=["ocr"])


@router.post("/process", response_model=ApiResponse[dict])
async def process_ocr(
    project_id: int,
    paper_ids: list[int] | None = None,
    force_ocr: bool = False,
    use_gpu: bool = True,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Run OCR/text extraction on downloaded PDFs."""

    if paper_ids:
        stmt = select(Paper).where(Paper.id.in_(paper_ids), Paper.project_id == project_id)
    else:
        stmt = select(Paper).where(
            Paper.project_id == project_id,
            Paper.status == PaperStatus.PDF_DOWNLOADED,
        )

    result = await db.execute(stmt)
    papers = list(result.scalars().all())

    if not papers:
        return ApiResponse(data={"processed": 0, "failed": 0, "total": 0, "message": "No papers to process"})

    service = OCRService(use_gpu=use_gpu)
    processed = 0
    failed = 0

    for paper in papers:
        if not paper.pdf_path:
            failed += 1
            continue

        try:
            ocr_result = service.process_pdf(paper.pdf_path, force_ocr=force_ocr)

            if ocr_result.get("error"):
                failed += 1
                continue

            # Save OCR result
            service.save_result(paper.id, ocr_result)

            # Create chunks and store in DB
            chunks = service.chunk_text(ocr_result["pages"])
            for chunk_data in chunks:
                chunk = PaperChunk(
                    paper_id=paper.id,
                    chunk_type=chunk_data["chunk_type"],
                    content=chunk_data["content"],
                    page_number=chunk_data.get("page_number"),
                    chunk_index=chunk_data["chunk_index"],
                    token_count=chunk_data.get("token_count", 0),
                )
                db.add(chunk)

            paper.status = PaperStatus.OCR_COMPLETE
            processed += 1
        except Exception as e:
            logger.error("OCR failed for paper %s: %s", paper.id, e)
            failed += 1

    await db.flush()
    return ApiResponse(data={"processed": processed, "failed": failed, "total": len(papers)})


@router.get("/stats", response_model=ApiResponse[dict])
async def ocr_stats(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Return OCR processing statistics."""
    stats = {}
    for status in PaperStatus:
        count = (
            await db.execute(select(func.count(Paper.id)).where(Paper.project_id == project_id, Paper.status == status))
        ).scalar() or 0
        stats[status.value] = count

    chunk_count = (
        await db.execute(select(func.count(PaperChunk.id)).join(Paper).where(Paper.project_id == project_id))
    ).scalar() or 0

    return ApiResponse(data={**stats, "total_chunks": chunk_count})
