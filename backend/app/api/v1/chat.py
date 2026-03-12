"""Chat streaming API — SSE endpoint for real-time AI responses with citations."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.paper import Paper
from app.schemas.conversation import ChatStreamRequest
from app.services.llm.client import LLMClient, get_llm_client
from app.services.rag_service import RAGService
from app.services.user_settings_service import UserSettingsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

TOOL_MODE_PROMPTS = {
    "qa": (
        "You are a scientific research assistant. Answer the question based on the provided context. "
        "Use inline citations like [1], [2] to reference source papers. "
        "If the context doesn't contain enough information, say so honestly."
    ),
    "citation_lookup": (
        "You are a citation finder. Given the user's text, identify and list the most relevant "
        "references from the provided context. Format as a numbered list with paper titles, authors, "
        "and brief explanations of relevance. Keep your own commentary minimal."
    ),
    "review_outline": (
        "You are a literature review expert. Based on the provided context, generate a structured "
        "review outline with sections, subsections, and key points. Use citations like [1], [2] "
        "to reference sources. Suggest a logical flow and highlight key themes."
    ),
    "gap_analysis": (
        "You are a research gap analyst. Based on the provided literature context, identify "
        "research gaps, unexplored areas, and potential future directions. Cite existing work "
        "using [1], [2] format. Be specific about what has been studied and what remains open."
    ),
}


async def _get_rag_service_for_chat(db: AsyncSession) -> tuple[RAGService, LLMClient]:
    svc = UserSettingsService(db)
    config = await svc.get_merged_llm_config()
    llm = get_llm_client(config=config)

    from llama_index.core.embeddings import MockEmbedding

    from app.services.embedding_service import get_embedding_model

    embed = MockEmbedding(embed_dim=128) if config.provider == "mock" else get_embedding_model()
    rag = RAGService(llm=llm, embed_model=embed)
    return rag, llm


async def _stream_chat(
    request: ChatStreamRequest,
    db: AsyncSession,
):
    """Generator that yields SSE events for the chat stream."""
    message_id = str(uuid.uuid4())[:12]

    yield _sse("message_start", {"message_id": message_id})

    try:
        rag, llm = await _get_rag_service_for_chat(db)

        all_sources = []
        all_contexts = []
        citations = []

        if request.knowledge_base_ids:
            rag_tasks = [
                rag.query(
                    project_id=kb_id,
                    question=request.message,
                    top_k=5,
                    include_sources=True,
                )
                for kb_id in request.knowledge_base_ids
            ]
            results = await asyncio.gather(*rag_tasks, return_exceptions=True)

            for result in results:
                if isinstance(result, Exception):
                    logger.warning("RAG query failed for a KB: %s", result)
                    continue
                if result.get("sources"):
                    all_sources.extend(result["sources"])
                    for src in result["sources"]:
                        all_contexts.append(
                            f"[Source: {src.get('paper_title', 'Unknown')}, "
                            f"p.{src.get('page_number', '?')}]\n{src.get('excerpt', '')}"
                        )

            paper_ids = list({pid for pid in (src.get("paper_id") for src in all_sources) if pid is not None})
            papers_by_id: dict[int, Paper] = {}
            if paper_ids:
                result = await db.execute(select(Paper).where(Paper.id.in_(paper_ids)))
                papers_by_id = {p.id: p for p in result.scalars().all()}

            for i, src in enumerate(all_sources, 1):
                paper = papers_by_id.get(src.get("paper_id")) if src.get("paper_id") else None
                citation = {
                    "index": i,
                    "paper_id": src.get("paper_id"),
                    "paper_title": src.get("paper_title", ""),
                    "page_number": src.get("page_number"),
                    "excerpt": src.get("excerpt", ""),
                    "relevance_score": src.get("relevance_score", 0),
                    "chunk_type": src.get("chunk_type", "text"),
                    "authors": paper.authors if paper else None,
                    "year": paper.year if paper else None,
                    "doi": paper.doi if paper else None,
                }
                citations.append(citation)
                yield _sse("citation", citation)

        history_messages = []
        conversation_id = request.conversation_id

        if conversation_id:
            result = await db.execute(
                select(Conversation)
                .where(Conversation.id == conversation_id)
                .options(selectinload(Conversation.messages))
            )
            conv = result.scalar_one_or_none()
            if conv:
                for msg in conv.messages[-10:]:
                    history_messages.append({"role": msg.role, "content": msg.content})

        if request.knowledge_base_ids:
            system_prompt = TOOL_MODE_PROMPTS.get(request.tool_mode, TOOL_MODE_PROMPTS["qa"])
            context_text = "\n\n---\n\n".join(all_contexts) if all_contexts else "No relevant documents found."
            user_content = f"Context:\n{context_text}\n\nQuestion: {request.message}"
        else:
            system_prompt = (
                "You are a helpful scientific research assistant. "
                "Answer questions clearly and accurately. "
                "If you don't know the answer, say so honestly."
            )
            user_content = request.message

        messages = [
            {"role": "system", "content": system_prompt},
            *history_messages,
            {"role": "user", "content": user_content},
        ]

        full_response = ""
        async for token in llm.chat_stream(messages, temperature=0.3, task_type="chat"):
            full_response += token
            yield _sse("text_delta", {"delta": token})

        if not conversation_id:
            title = request.message[:50] + ("..." if len(request.message) > 50 else "")
            conv = Conversation(
                title=title,
                knowledge_base_ids=request.knowledge_base_ids,
                model=request.model or "",
                tool_mode=request.tool_mode,
            )
            db.add(conv)
            await db.flush()
            conversation_id = conv.id

        user_msg = Message(
            conversation_id=conversation_id,
            role="user",
            content=request.message,
        )
        assistant_msg = Message(
            conversation_id=conversation_id,
            role="assistant",
            content=full_response,
            citations=citations if citations else None,
        )
        db.add(user_msg)
        db.add(assistant_msg)
        await db.commit()

        yield _sse(
            "message_end",
            {
                "message_id": message_id,
                "conversation_id": conversation_id,
                "finish_reason": "stop",
            },
        )

    except Exception as e:
        logger.exception("Chat stream error")
        yield _sse("error", {"code": "stream_error", "message": str(e)})


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/stream")
async def chat_stream(
    request: ChatStreamRequest,
    db: AsyncSession = Depends(get_db),
):
    """SSE streaming chat endpoint — sends token-level events."""
    return StreamingResponse(
        _stream_chat(request, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
