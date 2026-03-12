"""Helpers for accessing request-scoped services from LangGraph config.

Convention: ``understand_node`` creates ``llm`` and ``rag`` and writes them
into ``config["configurable"]``.  Downstream nodes use these helpers.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from langchain_core.runnables import RunnableConfig
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.services.llm.client import LLMClient
    from app.services.rag_service import RAGService


def get_chat_db(config: RunnableConfig) -> AsyncSession:
    return config["configurable"]["db"]


def get_chat_llm(config: RunnableConfig) -> LLMClient:
    return config["configurable"]["llm"]


def get_chat_rag(config: RunnableConfig) -> RAGService:
    return config["configurable"]["rag"]


def get_configurable(config: RunnableConfig) -> dict[str, Any]:
    return config["configurable"]
