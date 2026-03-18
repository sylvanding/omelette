"""Reranker model loading, caching, and async-safe inference."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from app.config import settings

if TYPE_CHECKING:
    from llama_index.core.schema import NodeWithScore

logger = logging.getLogger(__name__)

_reranker_semaphore: asyncio.Semaphore | None = None


def _get_semaphore() -> asyncio.Semaphore:
    global _reranker_semaphore
    if _reranker_semaphore is None:
        _reranker_semaphore = asyncio.Semaphore(settings.reranker_concurrency_limit)
    return _reranker_semaphore


def _build_reranker(model_name: str):
    """Build a SentenceTransformerRerank instance (heavy, runs on GPU)."""
    from llama_index.postprocessor.sbert_rerank import SentenceTransformerRerank

    from app.services.embedding_service import _inject_hf_env, detect_gpu

    _inject_hf_env()

    _has_gpu, _count, device = detect_gpu(pinned_gpu_id=settings.rerank_gpu_id)
    batch_size = settings.rerank_batch_size
    logger.info("Loading reranker model=%s device=%s top_n=%d", model_name, device, batch_size)
    return SentenceTransformerRerank(
        model=model_name,
        top_n=batch_size,  # Oversample before rerank, then return top batch_size; aligns with RAG oversample_factor
        device=device,
        keep_retrieval_score=True,
    )


def get_reranker(*, model_name: str | None = None):
    """Return a cached reranker via GPUModelManager (TTL-managed)."""
    from app.services.embedding_service import detect_gpu
    from app.services.gpu_model_manager import gpu_model_manager

    name = model_name or settings.reranker_model
    _, _, device = detect_gpu(pinned_gpu_id=settings.rerank_gpu_id)
    return gpu_model_manager.acquire(
        "reranker",
        lambda: _build_reranker(name),
        model_name=name,
        device=device,
    )


async def rerank_nodes(
    nodes: list[NodeWithScore],
    query: str,
    top_n: int,
) -> list[NodeWithScore]:
    """Apply reranker with concurrency control and graceful fallback.

    Uses a semaphore to serialize GPU inference and falls back to
    the original node order on any failure.
    """
    if not nodes:
        return []
    try:
        from llama_index.core.schema import QueryBundle

        reranker = get_reranker()
        query_bundle = QueryBundle(query_str=query)
        async with _get_semaphore():
            reranked = await asyncio.to_thread(
                reranker.postprocess_nodes,
                nodes,
                query_bundle=query_bundle,
            )
        return reranked[:top_n]
    except (ImportError, OSError, RuntimeError):
        logger.warning("Reranking failed, returning original nodes", exc_info=True)
        return nodes[:top_n]
