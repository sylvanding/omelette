"""Background paper processing: OCR + RAG indexing in one pass.

Designed to run as a fire-and-forget ``asyncio.create_task`` so the upload
API can return immediately while processing continues in the background.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import async_session_factory
from app.models import Paper, PaperStatus
from app.models.chunk import PaperChunk
from app.services.ocr_service import OCRService
from app.services.rag_service import RAGService

logger = logging.getLogger(__name__)


async def process_papers_background(
    project_id: int,
    paper_ids: list[int],
) -> None:
    """OCR + RAG-index a list of papers.  Safe to call via ``create_task``."""
    try:
        await _process_papers(project_id, paper_ids)
    except Exception:
        logger.exception("Background paper processing failed for project %d", project_id)


async def _process_papers(project_id: int, paper_ids: list[int]) -> None:
    ocr = OCRService(use_gpu=True)

    async with async_session_factory() as db:
        stmt = select(Paper).where(
            Paper.id.in_(paper_ids),
            Paper.project_id == project_id,
        )
        papers = list((await db.execute(stmt)).scalars().all())

        ocr_done_ids: list[int] = []

        for paper in papers:
            if paper.status not in (PaperStatus.PDF_DOWNLOADED, PaperStatus.ERROR):
                if paper.status in (PaperStatus.OCR_COMPLETE, PaperStatus.INDEXED):
                    ocr_done_ids.append(paper.id)
                continue

            if not paper.pdf_path:
                paper.status = PaperStatus.ERROR
                continue

            try:
                result = await asyncio.to_thread(ocr.process_pdf, paper.pdf_path)

                if result.get("error"):
                    paper.status = PaperStatus.ERROR
                    logger.warning("OCR error for paper %d: %s", paper.id, result.get("error"))
                    continue

                ocr.save_result(paper.id, result)

                chunks = ocr.chunk_text(result.get("pages", []))
                for chunk_data in chunks:
                    db.add(
                        PaperChunk(
                            paper_id=paper.id,
                            chunk_type=chunk_data["chunk_type"],
                            content=chunk_data["content"],
                            page_number=chunk_data.get("page_number"),
                            chunk_index=chunk_data["chunk_index"],
                            token_count=chunk_data.get("token_count", 0),
                        )
                    )

                paper.status = PaperStatus.OCR_COMPLETE
                ocr_done_ids.append(paper.id)
                logger.info("OCR complete for paper %d (%s)", paper.id, paper.title[:40])
            except Exception:
                paper.status = PaperStatus.ERROR
                logger.exception("OCR failed for paper %d", paper.id)

        await db.flush()

        if not ocr_done_ids:
            await db.commit()
            return

        idx_stmt = (
            select(Paper)
            .where(Paper.id.in_(ocr_done_ids), Paper.project_id == project_id)
            .options(selectinload(Paper.chunks))
        )
        idx_papers = list((await db.execute(idx_stmt)).scalars().all())

        chunks_to_index: list[dict] = []
        for paper in idx_papers:
            for chunk in paper.chunks:
                chunks_to_index.append(
                    {
                        "paper_id": chunk.paper_id,
                        "paper_title": paper.title,
                        "chunk_type": chunk.chunk_type or "text",
                        "page_number": chunk.page_number or 0,
                        "chunk_index": chunk.chunk_index or 0,
                        "content": chunk.content,
                    }
                )

        if chunks_to_index:
            try:
                rag = RAGService()
                await rag.index_chunks(project_id=project_id, chunks=chunks_to_index)
                for paper in idx_papers:
                    paper.status = PaperStatus.INDEXED
                logger.info(
                    "Indexed %d chunks from %d papers for project %d",
                    len(chunks_to_index),
                    len(idx_papers),
                    project_id,
                )
            except Exception:
                logger.exception("RAG indexing failed for project %d", project_id)

        await db.commit()
