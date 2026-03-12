"""Helpers for accessing request-scoped services from LangGraph config.

LangGraph shallow-copies the config dict for each node, but nested mutable
objects remain shared.  We store a ``_services`` dict in ``configurable``
so that ``understand_node`` can create ``llm``/``rag`` once and downstream
nodes read them through the same reference.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from langchain_core.runnables import RunnableConfig
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.services.llm.client import LLMClient
    from app.services.rag_service import RAGService


def _services(config: RunnableConfig) -> dict[str, Any]:
    """Return the shared mutable services dict, creating it if needed."""
    cfg = config["configurable"]
    if "_services" not in cfg:
        cfg["_services"] = {}
    return cfg["_services"]


def get_chat_db(config: RunnableConfig) -> AsyncSession:
    return config["configurable"]["db"]


def get_chat_llm(config: RunnableConfig) -> LLMClient:
    return _services(config)["llm"]


def get_chat_rag(config: RunnableConfig) -> RAGService:
    return _services(config)["rag"]


def set_chat_services(config: RunnableConfig, *, llm: Any, rag: Any) -> None:
    """Called by understand_node to share LLM and RAG with downstream nodes."""
    svc = _services(config)
    svc["llm"] = llm
    svc["rag"] = rag


def get_configurable(config: RunnableConfig) -> dict[str, Any]:
    return config["configurable"]
