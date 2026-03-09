"""RAG knowledge base query API endpoints."""

from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/projects/{project_id}/rag", tags=["rag"])


class RAGQueryRequest(BaseModel):
    question: str
    top_k: int = 10
    use_reranker: bool = True
    include_sources: bool = True


class RAGQueryResponse(BaseModel):
    answer: str
    sources: list[dict] = []
    confidence: float = 0.0


@router.post("/query", response_model=ApiResponse[RAGQueryResponse])
async def rag_query(
    project_id: int,
    body: RAGQueryRequest,
    db: AsyncSession = Depends(get_db),
):
    """Answer a question using RAG over the project's indexed literature."""
    # TODO: Implement in Phase 2
    return ApiResponse(data=RAGQueryResponse(
        answer="RAG query not yet implemented. Please index papers first.",
        sources=[],
        confidence=0.0,
    ))


@router.post("/index", response_model=ApiResponse[dict])
async def build_index(project_id: int, db: AsyncSession = Depends(get_db)):
    """Build or rebuild the vector index for all processed papers."""
    # TODO: Implement in Phase 2
    return ApiResponse(data={"status": "pending", "message": "Index build not yet implemented"})


@router.get("/stats", response_model=ApiResponse[dict])
async def index_stats(project_id: int, db: AsyncSession = Depends(get_db)):
    """Return indexing statistics."""
    # TODO: Implement in Phase 2
    return ApiResponse(data={"total_chunks": 0, "indexed_papers": 0})
