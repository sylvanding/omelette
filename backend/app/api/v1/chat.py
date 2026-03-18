"""Chat streaming API — Data Stream Protocol endpoint (Vercel AI SDK 5.0)."""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import Callable

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.middleware.rate_limit import limiter
from app.pipelines.chat.graph import create_chat_pipeline
from app.pipelines.chat.stream_writer import format_done, format_finish, format_start
from app.schemas.common import ApiResponse
from app.schemas.conversation import ChatStreamRequest
from app.utils.sse import format_sse_error

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


class CompletionRequest(BaseModel):
    prefix: str = Field(..., min_length=10, max_length=2000)
    conversation_id: int | None = None
    knowledge_base_ids: list[int] = Field(default_factory=list)
    recent_messages: list[dict] = Field(default_factory=list)


class CompletionResponse(BaseModel):
    completion: str
    confidence: float


async def _init_services(db: AsyncSession) -> dict:
    """Create LLM + RAG services from user settings."""
    from app.services.llm.client import get_llm_client
    from app.services.rag_service import RAGService
    from app.services.user_settings_service import UserSettingsService

    svc = UserSettingsService(db)
    llm_config = await svc.get_merged_llm_config()
    llm = get_llm_client(config=llm_config)

    if llm_config.provider == "mock":
        from llama_index.core.embeddings import MockEmbedding

        embed = MockEmbedding(embed_dim=128)
    else:
        from app.services.embedding_service import get_embedding_model

        embed = get_embedding_model()

    rag = RAGService(llm=llm, embed_model=embed)
    return {"llm": llm, "rag": rag}


async def _stream_chat(
    request: ChatStreamRequest,
    db: AsyncSession,
    init_services: Callable = _init_services,
):
    """Yield Data Stream Protocol SSE events from the LangGraph chat pipeline."""
    msg_id = f"msg_{uuid.uuid4().hex}"
    yield format_start(msg_id)

    try:
        services = await init_services(db)
        config = {"configurable": {"db": db, "_services": services}}

        pipeline = create_chat_pipeline()
        initial_state = {
            "message": request.message,
            "knowledge_base_ids": request.knowledge_base_ids,
            "tool_mode": request.tool_mode,
            "conversation_id": request.conversation_id,
            "model": request.model or "",
            "rag_top_k": request.rag_top_k,
            "use_reranker": request.use_reranker,
        }

        async for event in pipeline.astream(
            initial_state,
            config=config,
            stream_mode="custom",
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        yield format_finish()
    except Exception as e:
        logger.exception("Chat stream error")
        yield format_sse_error(str(e), code=500)
    finally:
        yield format_done()


@router.post("/stream", summary="Stream chat completion")
@limiter.limit("30/minute")
async def chat_stream(
    request: Request,
    body: ChatStreamRequest,
    db: AsyncSession = Depends(get_db),
):
    """Data Stream Protocol (Vercel AI SDK 5.0) chat endpoint."""
    return StreamingResponse(
        _stream_chat(body, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Vercel-AI-UI-Message-Stream": "v1",
        },
    )


@router.post("/complete", response_model=ApiResponse[CompletionResponse], summary="Autocomplete suggestion")
async def complete(request: CompletionRequest):
    """Return a short text completion suggestion for autocomplete."""
    from app.services.completion_service import CompletionService

    svc = CompletionService()
    result = await svc.complete(
        prefix=request.prefix,
        conversation_id=request.conversation_id,
        knowledge_base_ids=request.knowledge_base_ids or [],
        recent_messages=request.recent_messages or [],
    )
    return ApiResponse(data=CompletionResponse(**result))
