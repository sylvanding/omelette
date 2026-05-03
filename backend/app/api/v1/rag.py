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

from app.api.deps import get_db, get_llm, get_project
from app.middleware.rate_limit import limiter
from app.models import Paper, PaperStatus, Project
from app.schemas.common import ApiResponse
from app.services.llm.client import LLMClient
from app.services.rag_service import RAGService
from app.utils.sse import format_sse_error

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


class EvidencePaperFinding(BaseModel):
    """A single paper's stance and finding."""

    paper_id: int
    paper_title: str
    stance: str
    finding: str
    source_quote: str
    confidence: float


class EvidenceConsensusResponse(BaseModel):
    """Response from evidence consensus analysis."""

    support_count: int
    contradict_count: int
    mixed_count: int
    total_papers: int
    support_percentage: float
    contradict_percentage: float
    mixed_percentage: float
    papers: list[EvidencePaperFinding]
    overall_confidence: float


def get_rag_service(llm: LLMClient = Depends(get_llm)) -> RAGService:
    return RAGService(llm=llm)


def _is_recoverable_index_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "cuda out of memory" in msg or "client has been closed" in msg


def _reset_chroma_client_if_closed(rag: RAGService, exc: Exception) -> None:
    if "client has been closed" in str(exc).lower():
        rag._chroma_client = None
        rag._count_cache.clear()


async def _preserve_existing_index(rag: RAGService, project_id: int) -> dict:
    try:
        existing_count = await rag._get_count(project_id)
    except Exception:
        logger.warning("Failed to count existing index for project %d; returning zero", project_id, exc_info=True)
        existing_count = 0
    return {
        "indexed": existing_count,
        "collection": f"project_{project_id}",
    }


async def _index_chunks_with_recovery(rag: RAGService, project_id: int, chunks: list[dict], **kwargs) -> dict:
    try:
        return await rag.index_chunks(project_id=project_id, chunks=chunks, **kwargs)
    except Exception as exc:
        if not _is_recoverable_index_error(exc):
            raise

        logger.warning("Indexing failed with recoverable error, retrying with fresh clients: %s", exc)
        _reset_chroma_client_if_closed(rag, exc)

        try:
            rag._reload_embed_model()
            return await rag.index_chunks(project_id=project_id, chunks=chunks, **kwargs)
        except Exception as retry_exc:
            if not _is_recoverable_index_error(retry_exc):
                raise
            logger.exception("Index retry failed with recoverable error; preserving existing index")
            _reset_chroma_client_if_closed(rag, retry_exc)
            return await _preserve_existing_index(rag, project_id)


@router.post("/query", response_model=ApiResponse[RAGQueryResponse], summary="RAG query over literature")
async def rag_query(
    project_id: int,
    body: RAGQueryRequest,
    rag: RAGService = Depends(get_rag_service),
    project: Project = Depends(get_project),
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


@router.post("/index", response_model=ApiResponse[dict], summary="Build vector index")
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

    index_result = await _index_chunks_with_recovery(rag, project_id, chunks_to_index)

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


@router.post("/index/stream", summary="Build index with SSE progress")
async def build_index_stream(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    rag: RAGService = Depends(get_rag_service),
    project: Project = Depends(get_project),
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
                _index_chunks_with_recovery(
                    rag,
                    project_id,
                    chunks_to_index,
                    on_progress=on_progress,
                )
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
            yield format_sse_error(str(exc), code=500)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/stats", response_model=ApiResponse[dict], summary="Get index statistics")
async def index_stats(
    project_id: int,
    rag: RAGService = Depends(get_rag_service),
    project: Project = Depends(get_project),
):
    """Return indexing statistics."""
    stats = await rag.get_stats(project_id=project_id)
    return ApiResponse(data=stats)


@router.delete("/index", response_model=ApiResponse[dict], summary="Delete vector index")
async def delete_index(
    project_id: int,
    rag: RAGService = Depends(get_rag_service),
    project: Project = Depends(get_project),
):
    """Delete the vector index for the project."""
    result = await rag.delete_index(project_id=project_id)
    return ApiResponse(data=result)


class EvidenceConsensusRequest(BaseModel):
    question: str
    top_k: int = Field(default=10, ge=1, le=50)


@router.post(
    "/evidence-consensus",
    response_model=ApiResponse[EvidenceConsensusResponse],
    summary="Analyze evidence consensus",
)
async def evidence_consensus(
    project_id: int,
    body: EvidenceConsensusRequest,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Analyze how papers support or contradict a research question."""
    from app.services.evidence_consensus_service import EvidenceConsensusService

    rag = RAGService()
    sources = await rag.retrieve_only(
        project_id=project_id,
        question=body.question,
        top_k=body.top_k,
    )

    if not sources:
        return ApiResponse(
            data=EvidenceConsensusResponse(
                support_count=0,
                contradict_count=0,
                mixed_count=0,
                total_papers=0,
                support_percentage=0.0,
                contradict_percentage=0.0,
                mixed_percentage=0.0,
                papers=[],
                overall_confidence=0.0,
            )
        )

    papers_for_analysis = [
        {
            "paper_id": s["paper_id"],
            "title": s.get("paper_title", ""),
            "content": s.get("excerpt", ""),
        }
        for s in sources
    ]

    llm = get_llm()
    svc = EvidenceConsensusService(llm)
    result = await svc.analyze_consensus(body.question, papers_for_analysis)
    return ApiResponse(data=EvidenceConsensusResponse(**result))
