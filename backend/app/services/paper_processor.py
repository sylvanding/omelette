"""Background paper processing: OCR + RAG indexing in one pass.

Designed to run as a fire-and-forget ``asyncio.create_task`` so the upload
API can return immediately while processing continues in the background.

GPU parallelisation:
  - Multiple PDFs are OCR-ed concurrently via ``asyncio.gather``.
  - Each worker gets a distinct ``gpu_id`` (round-robin) so that all
    visible GPUs are utilised.
  - DB writes and RAG indexing remain serial (ChromaDB limitation).
"""

from __future__ import annotations

import asyncio
import logging
import time

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import async_session_factory
from app.models import Paper, PaperStatus
from app.models.chunk import PaperChunk
from app.services.ocr_service import OCRService
from app.services.rag_service import RAGService

logger = logging.getLogger(__name__)


def _detect_gpu_count() -> int:
    """Return the number of CUDA devices visible to this process (0 = CPU-only)."""
    try:
        import torch

        if torch.cuda.is_available():
            return torch.cuda.device_count()
    except ImportError:
        pass
    return 0


def _resolve_parallel_limit(gpu_count: int) -> int:
    """Determine how many OCR tasks may run concurrently."""
    configured = settings.ocr_parallel_limit
    if configured > 0:
        return configured
    return max(gpu_count, 1)


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
    gpu_count = _detect_gpu_count()
    parallel_limit = _resolve_parallel_limit(gpu_count)
    use_gpu = gpu_count > 0

    logger.info(
        "Paper processing: %d papers, %d GPU(s), parallel_limit=%d",
        len(paper_ids),
        gpu_count,
        parallel_limit,
    )

    async with async_session_factory() as db:
        stmt = select(Paper).where(
            Paper.id.in_(paper_ids),
            Paper.project_id == project_id,
        )
        papers = list((await db.execute(stmt)).scalars().all())

        ocr_done_ids: list[int] = []
        papers_to_ocr: list[Paper] = []

        for paper in papers:
            if paper.status not in (PaperStatus.PDF_DOWNLOADED, PaperStatus.ERROR):
                if paper.status in (PaperStatus.OCR_COMPLETE, PaperStatus.INDEXED):
                    ocr_done_ids.append(paper.id)
                continue
            if not paper.pdf_path:
                paper.status = PaperStatus.ERROR
                continue
            papers_to_ocr.append(paper)

        if papers_to_ocr:
            semaphore = asyncio.Semaphore(parallel_limit)

            async def _ocr_one(paper: Paper, worker_id: int) -> tuple[Paper, dict | None]:
                gpu_id = worker_id % gpu_count if gpu_count > 0 else 0
                ocr = OCRService(use_gpu=use_gpu, gpu_id=gpu_id)
                async with semaphore:
                    try:
                        t0 = time.monotonic()
                        result = await ocr.process_pdf_async(paper.pdf_path)
                        elapsed = time.monotonic() - t0
                        logger.info(
                            "OCR worker %d (gpu=%d) finished paper %d in %.1fs",
                            worker_id,
                            gpu_id,
                            paper.id,
                            elapsed,
                        )
                        return paper, result
                    except Exception:
                        logger.exception("OCR failed for paper %d (worker %d)", paper.id, worker_id)
                        return paper, None

            tasks = [_ocr_one(paper, i) for i, paper in enumerate(papers_to_ocr)]
            results = await asyncio.gather(*tasks)

            for paper, result in results:
                if result is None:
                    paper.status = PaperStatus.ERROR
                    continue

                if result.get("error"):
                    paper.status = PaperStatus.ERROR
                    logger.warning("OCR error for paper %d: %s", paper.id, result.get("error"))
                    continue

                OCRService(use_gpu=False).save_result(paper.id, result)

                if result.get("method") == "mineru":
                    chunks = OCRService(use_gpu=False).chunk_mineru_markdown(result["md_content"])
                else:
                    chunks = OCRService(use_gpu=False).chunk_text(result.get("pages", []))

                for chunk_data in chunks:
                    db.add(
                        PaperChunk(
                            paper_id=paper.id,
                            chunk_type=chunk_data["chunk_type"],
                            content=chunk_data["content"],
                            page_number=chunk_data.get("page_number"),
                            chunk_index=chunk_data["chunk_index"],
                            token_count=chunk_data.get("token_count", 0),
                            has_formula=chunk_data.get("has_formula", False),
                            figure_path=chunk_data.get("figure_path", ""),
                        )
                    )

                paper.status = PaperStatus.OCR_COMPLETE
                ocr_done_ids.append(paper.id)
                logger.info("OCR complete for paper %d (%s)", paper.id, paper.title[:40])

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
                        "has_formula": chunk.has_formula,
                        "figure_path": chunk.figure_path,
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
