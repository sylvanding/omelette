"""Chat pipeline graph definition.

Flow:
  understand → [has KB?] → retrieve → rank → clean → generate → persist
                    └─ no KB ──────────────────────→ generate → persist
"""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from app.pipelines.chat.nodes import (
    clean_node,
    generate_node,
    persist_node,
    rank_node,
    retrieve_node,
    understand_node,
)
from app.pipelines.chat.state import ChatState


def _route_after_understand(state: ChatState) -> str:
    """Skip RAG nodes when no knowledge bases are selected."""
    kb_ids = state.get("knowledge_base_ids", [])
    if kb_ids:
        return "retrieve"
    return "generate"


def create_chat_pipeline():
    """Compile the chat StateGraph.

    No checkpointer — chat streams are stateless one-shot invocations.
    """
    graph = StateGraph(ChatState)

    graph.add_node("understand", understand_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("rank", rank_node)
    graph.add_node("clean", clean_node)
    graph.add_node("generate", generate_node)
    graph.add_node("persist", persist_node)

    graph.set_entry_point("understand")
    graph.add_conditional_edges(
        "understand",
        _route_after_understand,
        {"retrieve": "retrieve", "generate": "generate"},
    )
    graph.add_edge("retrieve", "rank")
    graph.add_edge("rank", "clean")
    graph.add_edge("clean", "generate")
    graph.add_edge("generate", "persist")
    graph.add_edge("persist", END)

    return graph.compile()
