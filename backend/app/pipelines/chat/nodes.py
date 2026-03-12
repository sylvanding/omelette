"""Chat pipeline node implementations.

Each node receives ``ChatState`` + ``RunnableConfig`` and returns a partial
state update.  Custom SSE events are emitted via ``get_stream_writer()``.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.config import get_stream_writer

from app.pipelines.chat.config_helpers import (
    get_chat_db,
    get_chat_llm,
    get_chat_rag,
    get_configurable,
)
from app.pipelines.chat.state import ChatMessageDict, ChatState, CitationDict

logger = logging.getLogger(__name__)

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

EXCERPT_CLEAN_PROMPT = (
    "Clean up the following text extracted from an academic PDF. "
    "Fix OCR errors, add missing spaces between words, restore formatting. "
    "Keep the original meaning intact. Output only the cleaned text, nothing else."
)

_clean_semaphore = asyncio.Semaphore(3)


def _emit_thinking(
    writer,
    step: str,
    label: str,
    status: str = "running",
    **kwargs: Any,
) -> None:
    writer(
        {
            "type": "data-thinking",
            "data": {"step": step, "label": label, "status": status, **kwargs},
        }
    )


# ---------------------------------------------------------------------------
# Node: understand
# ---------------------------------------------------------------------------


async def understand_node(state: ChatState, config: RunnableConfig) -> dict[str, Any]:
    """Initialize services, load conversation history, build system prompt."""
    writer = get_stream_writer()
    t0 = time.monotonic()

    _emit_thinking(
        writer,
        "understand",
        "Understanding query",
        detail=f"Analyzing '{state['message'][:40]}...'",
    )

    db = get_chat_db(config)

    from app.services.user_settings_service import UserSettingsService

    svc = UserSettingsService(db)
    llm_config = await svc.get_merged_llm_config()

    from app.services.llm.client import get_llm_client

    llm = get_llm_client(config=llm_config)

    from app.services.embedding_service import get_embedding_model
    from app.services.rag_service import RAGService

    if llm_config.provider == "mock":
        from llama_index.core.embeddings import MockEmbedding

        embed = MockEmbedding(embed_dim=128)
    else:
        embed = get_embedding_model()

    rag = RAGService(llm=llm, embed_model=embed)

    cfg = get_configurable(config)
    cfg["llm"] = llm
    cfg["rag"] = rag

    # Load conversation history
    history_messages: list[ChatMessageDict] = []
    conv_id = state.get("conversation_id")
    if conv_id:
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        from app.models.conversation import Conversation

        result = await db.execute(
            select(Conversation).where(Conversation.id == conv_id).options(selectinload(Conversation.messages))
        )
        conv = result.scalar_one_or_none()
        if conv:
            for msg in conv.messages[-10:]:
                history_messages.append({"role": msg.role, "content": msg.content})

    # Build system prompt
    kb_ids = state.get("knowledge_base_ids", [])
    tool_mode = state.get("tool_mode", "qa")
    if kb_ids:
        system_prompt = TOOL_MODE_PROMPTS.get(tool_mode, TOOL_MODE_PROMPTS["qa"])
    else:
        system_prompt = (
            "You are a helpful scientific research assistant. "
            "Answer questions clearly and accurately. "
            "If you don't know the answer, say so honestly."
        )

    _emit_thinking(
        writer,
        "understand",
        "Understanding query",
        status="done",
        duration_ms=int((time.monotonic() - t0) * 1000),
        summary="Ready",
    )

    return {
        "history_messages": history_messages,
        "system_prompt": system_prompt,
    }


# ---------------------------------------------------------------------------
# Node: retrieve
# ---------------------------------------------------------------------------


async def retrieve_node(state: ChatState, config: RunnableConfig) -> dict[str, Any]:
    """Run parallel RAG queries across knowledge bases."""
    writer = get_stream_writer()
    t0 = time.monotonic()
    rag = get_chat_rag(config)
    kb_ids = state.get("knowledge_base_ids", [])

    _emit_thinking(
        writer,
        "retrieve",
        "Searching knowledge base",
        detail=f"Searching in {len(kb_ids)} knowledge base(s)...",
    )

    tasks = [rag.query(project_id=kb_id, question=state["message"], top_k=5, include_sources=True) for kb_id in kb_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_sources: list[dict[str, Any]] = []
    all_contexts: list[str] = []
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

    _emit_thinking(
        writer,
        "retrieve",
        "Searching knowledge base",
        status="done",
        duration_ms=int((time.monotonic() - t0) * 1000),
        summary=f"Found {len(all_sources)} relevant sources",
    )

    return {"rag_results": all_sources, "all_contexts": all_contexts}


# ---------------------------------------------------------------------------
# Node: rank
# ---------------------------------------------------------------------------


async def rank_node(state: ChatState, config: RunnableConfig) -> dict[str, Any]:
    """Build citation list from RAG results, batch-loading Paper metadata."""
    writer = get_stream_writer()
    t0 = time.monotonic()
    db = get_chat_db(config)

    _emit_thinking(writer, "rank", "Analyzing citations", detail="Evaluating citation relevance...")

    all_sources = state.get("rag_results", [])

    from sqlalchemy import select

    from app.models.paper import Paper

    paper_ids = list({pid for pid in (src.get("paper_id") for src in all_sources) if pid is not None})
    papers_by_id: dict[int, Any] = {}
    if paper_ids:
        result = await db.execute(select(Paper).where(Paper.id.in_(paper_ids)))
        papers_by_id = {p.id: p for p in result.scalars().all()}

    citations: list[CitationDict] = []
    for i, src in enumerate(all_sources, 1):
        paper = papers_by_id.get(src.get("paper_id")) if src.get("paper_id") else None
        cit: CitationDict = {
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
        citations.append(cit)
        writer(
            {
                "type": "data-citation",
                "id": f"cit-{i}",
                "data": cit,
            }
        )

    high_relevance = sum(1 for c in citations if (c.get("relevance_score") or 0) > 0.6)
    _emit_thinking(
        writer,
        "rank",
        "Analyzing citations",
        status="done",
        duration_ms=int((time.monotonic() - t0) * 1000),
        summary=f"Selected {high_relevance} high-relevance citations (>60%)",
    )

    return {"citations": citations}


# ---------------------------------------------------------------------------
# Node: clean
# ---------------------------------------------------------------------------


async def _clean_single_excerpt(llm, excerpt: str) -> str:
    """Use LLM to clean OCR-extracted text with timeout and semaphore."""
    if not excerpt or len(excerpt) < 20:
        return excerpt
    async with _clean_semaphore:
        messages = [
            {"role": "system", "content": EXCERPT_CLEAN_PROMPT},
            {"role": "user", "content": excerpt},
        ]
        result = ""
        try:
            async with asyncio.timeout(10.0):
                async for token in llm.chat_stream(messages, temperature=0.1, task_type="clean"):
                    result += token
        except TimeoutError:
            logger.warning("Excerpt cleaning timed out, using original")
            return excerpt
        return result if result.strip() else excerpt


async def clean_node(state: ChatState, config: RunnableConfig) -> dict[str, Any]:
    """Clean citation excerpts in parallel using LLM."""
    writer = get_stream_writer()
    t0 = time.monotonic()
    llm = get_chat_llm(config)
    citations = list(state.get("citations", []))

    excerpts_to_clean = [(i, c["excerpt"]) for i, c in enumerate(citations) if c.get("excerpt")]
    if not excerpts_to_clean:
        _emit_thinking(writer, "clean", "Cleaning citation text", status="done", duration_ms=0, summary="No excerpts")
        return {"citations": citations}

    _emit_thinking(
        writer,
        "clean",
        "Cleaning citation text",
        detail=f"Improving readability of {len(excerpts_to_clean)} citations in parallel...",
    )

    clean_tasks = [_clean_single_excerpt(llm, excerpt) for _, excerpt in excerpts_to_clean]
    cleaned_results = await asyncio.gather(*clean_tasks, return_exceptions=True)

    enhanced_count = 0
    for (idx, _original), cleaned in zip(excerpts_to_clean, cleaned_results):
        if isinstance(cleaned, str) and cleaned.strip() and cleaned != citations[idx]["excerpt"]:
            citations[idx]["excerpt"] = cleaned
            enhanced_count += 1
            # Re-emit citation with same id → AI SDK reconciliation updates the Part
            writer(
                {
                    "type": "data-citation",
                    "id": f"cit-{citations[idx]['index']}",
                    "data": citations[idx],
                }
            )

    _emit_thinking(
        writer,
        "clean",
        "Cleaning citation text",
        status="done",
        duration_ms=int((time.monotonic() - t0) * 1000),
        summary=f"Enhanced {enhanced_count} citations",
    )

    return {"citations": citations}


# ---------------------------------------------------------------------------
# Node: generate
# ---------------------------------------------------------------------------


async def generate_node(state: ChatState, config: RunnableConfig) -> dict[str, Any]:
    """Stream LLM response token by token."""
    writer = get_stream_writer()
    t0 = time.monotonic()
    llm = get_chat_llm(config)

    # Build final messages
    system_prompt = state.get("system_prompt", "")
    history = state.get("history_messages", [])
    kb_ids = state.get("knowledge_base_ids", [])
    all_contexts = state.get("all_contexts", [])

    if kb_ids:
        context_text = "\n\n---\n\n".join(all_contexts) if all_contexts else "No relevant documents found."
        user_content = f"Context:\n{context_text}\n\nQuestion: {state['message']}"
    else:
        user_content = state["message"]

    messages: list[ChatMessageDict] = [
        {"role": "system", "content": system_prompt},
        *history,
        {"role": "user", "content": user_content},
    ]

    citations = state.get("citations", [])
    _emit_thinking(
        writer,
        "generate",
        "Generating answer",
        detail=f"Generating answer based on {len(citations)} citations...",
    )

    text_id = f"text_{uuid.uuid4().hex}"
    writer({"type": "text-start", "id": text_id})

    full_response = ""
    try:
        async for token in llm.chat_stream(messages, temperature=0.3, task_type="chat"):
            full_response += token
            writer({"type": "text-delta", "id": text_id, "delta": token})
    except Exception:
        logger.exception("LLM streaming error during generate")
        writer({"type": "text-end", "id": text_id})
        writer({"type": "error", "errorText": "LLM generation failed"})
        return {"assistant_content": full_response, "error": "LLM generation failed"}

    writer({"type": "text-end", "id": text_id})

    _emit_thinking(
        writer,
        "generate",
        "Generating answer",
        status="done",
        duration_ms=int((time.monotonic() - t0) * 1000),
        summary=f"Generated {len(full_response)} characters",
    )

    return {"assistant_content": full_response, "full_messages": messages}


# ---------------------------------------------------------------------------
# Node: persist
# ---------------------------------------------------------------------------


async def persist_node(state: ChatState, config: RunnableConfig) -> dict[str, Any]:
    """Save conversation and messages to the database."""
    writer = get_stream_writer()
    db = get_chat_db(config)

    try:
        from app.models.conversation import Conversation
        from app.models.message import Message

        conversation_id = state.get("conversation_id")

        if not conversation_id:
            title = state["message"][:50] + ("..." if len(state["message"]) > 50 else "")
            conv = Conversation(
                title=title,
                knowledge_base_ids=state.get("knowledge_base_ids") or [],
                model=state.get("model", ""),
                tool_mode=state.get("tool_mode", "qa"),
            )
            db.add(conv)
            await db.flush()
            conversation_id = conv.id

        citations = state.get("citations")
        user_msg = Message(
            conversation_id=conversation_id,
            role="user",
            content=state["message"],
        )
        assistant_msg = Message(
            conversation_id=conversation_id,
            role="assistant",
            content=state.get("assistant_content", ""),
            citations=citations if citations else None,
        )
        db.add(user_msg)
        db.add(assistant_msg)
        await db.commit()

        writer(
            {
                "type": "data-conversation",
                "data": {"conversation_id": conversation_id},
            }
        )

        return {"new_conversation_id": conversation_id}

    except Exception as e:
        logger.exception("Failed to persist conversation")
        _emit_thinking(writer, "persist", "Saving", status="error", detail=str(e))
        return {"error": f"persist failed: {e}"}
