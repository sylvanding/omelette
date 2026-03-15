"""LangGraph pipeline graph definitions — SearchPipeline, UploadPipeline."""

from __future__ import annotations

import logging
import os

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from app.pipelines.nodes import (
    apply_resolution_node,
    crawl_node,
    dedup_node,
    extract_metadata_node,
    hitl_dedup_node,
    import_node,
    index_node,
    ocr_node,
    search_node,
)
from app.pipelines.state import PipelineState

logger = logging.getLogger(__name__)

_memory_saver = MemorySaver()


def _get_checkpointer():
    """Return a persistent SQLite checkpointer if available, else MemorySaver."""
    try:
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

        from app.config import settings

        cp_dir = settings.langgraph_checkpoint_dir
        os.makedirs(cp_dir, exist_ok=True)
        cp_path = os.path.join(cp_dir, "checkpoints.db")
        return AsyncSqliteSaver.from_conn_string(cp_path)
    except Exception:
        logger.warning("SQLite checkpointer unavailable, falling back to MemorySaver")
        return _memory_saver


def _route_after_dedup(state: PipelineState) -> str:
    if state.get("conflicts"):
        return "hitl_dedup"
    return "apply_resolution"


def create_search_pipeline(checkpointer=None):
    """Create the keyword-search pipeline graph.

    Flow: search → dedup → [hitl if conflicts] → apply_resolution → import → crawl → ocr → index
    """
    graph = StateGraph(PipelineState)

    graph.add_node("search", search_node)
    graph.add_node("dedup", dedup_node)
    graph.add_node("hitl_dedup", hitl_dedup_node)
    graph.add_node("apply_resolution", apply_resolution_node)
    graph.add_node("import_papers", import_node)
    graph.add_node("crawl", crawl_node)
    graph.add_node("ocr", ocr_node)
    graph.add_node("index", index_node)

    graph.set_entry_point("search")
    graph.add_edge("search", "dedup")
    graph.add_conditional_edges(
        "dedup",
        _route_after_dedup,
        {
            "hitl_dedup": "hitl_dedup",
            "apply_resolution": "apply_resolution",
        },
    )
    graph.add_edge("hitl_dedup", "apply_resolution")
    graph.add_edge("apply_resolution", "import_papers")
    graph.add_edge("import_papers", "crawl")
    graph.add_edge("crawl", "ocr")
    graph.add_edge("ocr", "index")
    graph.add_edge("index", END)

    return graph.compile(checkpointer=checkpointer or _get_checkpointer())


def create_upload_pipeline(checkpointer=None):
    """Create the PDF-upload pipeline graph.

    Flow: extract_metadata → dedup → [hitl if conflicts] → apply_resolution → import → ocr → index
    (No crawl step since PDFs are already on disk.)
    """
    graph = StateGraph(PipelineState)

    graph.add_node("extract_metadata", extract_metadata_node)
    graph.add_node("dedup", dedup_node)
    graph.add_node("hitl_dedup", hitl_dedup_node)
    graph.add_node("apply_resolution", apply_resolution_node)
    graph.add_node("import_papers", import_node)
    graph.add_node("ocr", ocr_node)
    graph.add_node("index", index_node)

    graph.set_entry_point("extract_metadata")
    graph.add_edge("extract_metadata", "dedup")
    graph.add_conditional_edges(
        "dedup",
        _route_after_dedup,
        {
            "hitl_dedup": "hitl_dedup",
            "apply_resolution": "apply_resolution",
        },
    )
    graph.add_edge("hitl_dedup", "apply_resolution")
    graph.add_edge("apply_resolution", "import_papers")
    graph.add_edge("import_papers", "ocr")
    graph.add_edge("ocr", "index")
    graph.add_edge("index", END)

    return graph.compile(checkpointer=checkpointer or _get_checkpointer())
