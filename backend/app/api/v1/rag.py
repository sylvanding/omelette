"""RAG knowledge base query API endpoints."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_llm
from app.middleware.rate_limit import limiter
from app.models import Paper, PaperStatus
from app.schemas.common import ApiResponse
from app.services.llm.client import LLMClient
from app.services.rag_service import RAGService

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/projects/{project_id}/rag", tags=["rag"])


class RAGQueryRequest(BaseModel):
    question: str
    top_k: int = Field(default=10, ge=1, le=50)
    use_reranker: bool = True
    include_sources: bool = True


class RAGQueryResponse(BaseModel):
    answer: str
    sources: list[dict] = []
    confidence: float = 0.0


def get_rag_service(llm: LLMClient = Depends(get_llm)) -> RAGService:
    return RAGService(llm=llm)


@router.post("/query", response_model=ApiResponse[RAGQueryResponse])
async def rag_query(
    project_id: int,
    body: RAGQueryRequest,
    rag: RAGService = Depends(get_rag_service),
):
    """Answer a question using RAG over the project's indexed literature."""
    result = await rag.query(
        project_id=project_id,
        question=body.question,
        top_k=body.top_k,
        use_reranker=body.use_reranker,
        include_sources=body.include_sources,
    )
    return ApiResponse(data=RAGQueryResponse(**result))


@router.post("/index", response_model=ApiResponse[dict])
@limiter.limit("5/minute")
async def build_index(
    request: Request,
    project_id: int,
    db: AsyncSession = Depends(get_db),
    rag: RAGService = Depends(get_rag_service),
):
    """Build or rebuild the vector index for all processed papers."""
    # Fetch papers that are OCR_COMPLETE or INDEXED
    stmt = (
        select(Paper)
        .where(Paper.project_id == project_id)
        .where(Paper.status.in_([PaperStatus.OCR_COMPLETE, PaperStatus.INDEXED]))
        .options(selectinload(Paper.chunks))
    )
    result = await db.execute(stmt)
    papers = result.scalars().all()

    chunks_to_index = []
    for paper in papers:
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

    if not chunks_to_index:
        return ApiResponse(
            data={
                "indexed": 0,
                "message": "No paper chunks found. Ensure papers are OCR-complete first.",
            }
        )

    try:
        index_result = await rag.index_chunks(project_id=project_id, chunks=chunks_to_index)
    except RuntimeError as exc:
        if "CUDA out of memory" not in str(exc):
            raise
        logger.warning("CUDA OOM during indexing, reloading model on best GPU and retrying")
        rag._reload_embed_model()
        index_result = await rag.index_chunks(project_id=project_id, chunks=chunks_to_index)

    # Update paper status to INDEXED
    for paper in papers:
        paper.status = PaperStatus.INDEXED

    return ApiResponse(
        data={
            "indexed": index_result["indexed"],
            "collection": index_result["collection"],
            "papers_updated": len(papers),
        }
    )


@router.post("/index/stream")
async def build_index_stream(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    rag: RAGService = Depends(get_rag_service),
):
    """SSE streaming rebuild — sends progress events so the UI stays responsive."""

    async def _generate():
        def _sse(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data)}\n\n"

        try:
            yield _sse("progress", {"stage": "fetching", "percent": 0, "message": "Fetching papers…"})

            stmt = (
                select(Paper)
                .where(Paper.project_id == project_id)
                .where(Paper.status.in_([PaperStatus.OCR_COMPLETE, PaperStatus.INDEXED]))
                .options(selectinload(Paper.chunks))
            )
            result = await db.execute(stmt)
            papers = result.scalars().all()

            chunks_to_index: list[dict] = []
            for paper in papers:
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

            if not chunks_to_index:
                yield _sse(
                    "complete",
                    {"indexed": 0, "message": "No paper chunks found."},
                )
                return

            progress_queue: asyncio.Queue[tuple[str, int]] = asyncio.Queue()

            def on_progress(stage: str, percent: int) -> None:
                progress_queue.put_nowait((stage, percent))

            index_task = asyncio.create_task(
                rag.index_chunks(project_id=project_id, chunks=chunks_to_index, on_progress=on_progress)
            )

            while not index_task.done():
                try:
                    stage, pct = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                    yield _sse("progress", {"stage": stage, "percent": pct})
                except TimeoutError:
                    pass

            while not progress_queue.empty():
                stage, pct = progress_queue.get_nowait()
                yield _sse("progress", {"stage": stage, "percent": pct})

            index_result = await index_task

            for paper in papers:
                paper.status = PaperStatus.INDEXED
            await db.commit()

            yield _sse(
                "complete",
                {
                    "indexed": index_result["indexed"],
                    "collection": index_result["collection"],
                    "papers_updated": len(papers),
                },
            )
        except Exception as exc:
            logger.exception("SSE index build failed")
            yield _sse("error", {"message": str(exc)})

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/stats", response_model=ApiResponse[dict])
async def index_stats(project_id: int, rag: RAGService = Depends(get_rag_service)):
    """Return indexing statistics."""
    stats = await rag.get_stats(project_id=project_id)
    return ApiResponse(data=stats)


@router.delete("/index", response_model=ApiResponse[dict])
async def delete_index(project_id: int, rag: RAGService = Depends(get_rag_service)):
    """Delete the vector index for the project."""
    result = await rag.delete_index(project_id=project_id)
    return ApiResponse(data=result)
