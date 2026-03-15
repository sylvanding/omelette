"""Chat pipeline state definition."""

from __future__ import annotations

from typing import Any, Literal, TypedDict


class CitationDict(TypedDict, total=False):
    """Typed citation matching the frontend Citation interface."""

    index: int
    paper_id: int | None
    paper_title: str
    chunk_type: str
    page_number: int | None
    relevance_score: float
    excerpt: str
    authors: list[str] | None
    year: int | None
    doi: str | None


class ChatMessageDict(TypedDict):
    """LLM message format."""

    role: Literal["system", "user", "assistant"]
    content: str


class ChatState(TypedDict, total=False):
    """LangGraph chat pipeline state."""

    # --- Input (from request) ---
    message: str
    knowledge_base_ids: list[int]
    tool_mode: str
    conversation_id: int | None
    model: str
    rag_top_k: int
    use_reranker: bool

    # --- Intermediate (between nodes) ---
    rag_results: list[dict[str, Any]]
    citations: list[CitationDict]
    all_contexts: list[str]
    history_messages: list[ChatMessageDict]
    system_prompt: str
    full_messages: list[ChatMessageDict]

    # --- Output ---
    assistant_content: str
    new_conversation_id: int | None
    error: str | None
