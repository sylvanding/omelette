"""Embedding service — GPU-aware local embedding or cloud API fallback."""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

from app.config import settings

if TYPE_CHECKING:
    from llama_index.core.embeddings import BaseEmbedding

logger = logging.getLogger(__name__)

_cached_embed_model: BaseEmbedding | None = None


def detect_gpu() -> tuple[bool, int, str]:
    """Detect GPU availability. Returns (has_gpu, device_count, device_string)."""
    try:
        import torch

        if torch.cuda.is_available():
            count = torch.cuda.device_count()
            if count > 0:
                devices_env = os.environ.get("CUDA_VISIBLE_DEVICES", settings.cuda_visible_devices)
                logger.info(
                    "GPU detected: %d device(s), CUDA_VISIBLE_DEVICES=%s",
                    count,
                    devices_env,
                )
                return True, count, "cuda"
        logger.info("No CUDA GPU available, using CPU")
        return False, 0, "cpu"
    except ImportError:
        logger.warning("torch not installed, GPU detection skipped")
        return False, 0, "cpu"


def get_embedding_model(
    *,
    provider: str | None = None,
    model_name: str | None = None,
    force_reload: bool = False,
) -> BaseEmbedding:
    """Return a LlamaIndex BaseEmbedding based on configuration.

    Provider modes:
      - "local": HuggingFaceEmbedding with GPU auto-detection
      - "api":   OpenAIEmbedding (works with any OpenAI-compatible endpoint)
      - "mock":  Deterministic mock for tests
    """
    global _cached_embed_model
    if _cached_embed_model is not None and not force_reload:
        return _cached_embed_model

    prov = provider or getattr(settings, "embedding_provider", "local")
    name = model_name or settings.embedding_model

    if prov == "mock":
        model = _build_mock_embedding()
    elif prov == "api":
        model = _build_api_embedding(name)
    else:
        model = _build_local_embedding(name)

    _cached_embed_model = model
    return model


def _build_local_embedding(model_name: str) -> BaseEmbedding:
    from llama_index.embeddings.huggingface import HuggingFaceEmbedding

    has_gpu, _count, device = detect_gpu()
    logger.info("Loading local embedding model=%s device=%s", model_name, device)

    return HuggingFaceEmbedding(
        model_name=model_name,
        device=device,
        embed_batch_size=32 if has_gpu else 8,
    )


def _build_api_embedding(model_name: str) -> BaseEmbedding:
    from llama_index.embeddings.openai import OpenAIEmbedding

    api_key = getattr(settings, "embedding_api_key", "") or settings.openai_api_key
    logger.info("Using API embedding model=%s", model_name)

    return OpenAIEmbedding(
        model_name=model_name,
        api_key=api_key,
    )


def _build_mock_embedding() -> BaseEmbedding:
    from llama_index.core.embeddings import MockEmbedding

    return MockEmbedding(embed_dim=1024)
