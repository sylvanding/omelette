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
_env_injected = False


def _inject_hf_env() -> None:
    """Propagate proxy and HF mirror settings to os.environ so that
    huggingface_hub / sentence-transformers honour them during downloads."""
    global _env_injected
    if _env_injected:
        return
    _env_injected = True

    if settings.http_proxy and not os.environ.get("HTTP_PROXY"):
        os.environ["HTTP_PROXY"] = settings.http_proxy
        logger.info("Injected HTTP_PROXY=%s for HuggingFace downloads", settings.http_proxy)
    if settings.https_proxy and not os.environ.get("HTTPS_PROXY"):
        os.environ["HTTPS_PROXY"] = settings.https_proxy
        logger.info("Injected HTTPS_PROXY=%s for HuggingFace downloads", settings.https_proxy)

    if settings.hf_endpoint and not os.environ.get("HF_ENDPOINT"):
        os.environ["HF_ENDPOINT"] = settings.hf_endpoint
        logger.info("Using HuggingFace mirror: %s", settings.hf_endpoint)


def detect_gpu(*, pinned_gpu_id: int = -1) -> tuple[bool, int, str]:
    """Detect GPU availability and pick the best device.

    Args:
        pinned_gpu_id: If >= 0, skip auto-detection and return ``cuda:N``.

    Returns (has_gpu, device_count, device_string) where device_string is
    ``"cuda:N"`` (best/pinned device) or ``"cpu"``.
    """
    try:
        import torch

        if torch.cuda.is_available():
            count = torch.cuda.device_count()
            if count > 0:
                if 0 <= pinned_gpu_id < count:
                    device = f"cuda:{pinned_gpu_id}"
                    logger.info("GPU pinned: %s (of %d device(s))", device, count)
                    return True, count, device
                devices_env = os.environ.get("CUDA_VISIBLE_DEVICES", settings.cuda_visible_devices)
                best_device = _pick_best_gpu(count)
                logger.info(
                    "GPU detected: %d device(s), CUDA_VISIBLE_DEVICES=%s, selected=%s",
                    count,
                    devices_env,
                    best_device,
                )
                return True, count, best_device
        logger.info("No CUDA GPU available, using CPU")
        return False, 0, "cpu"
    except ImportError:
        logger.warning("torch not installed, GPU detection skipped")
        return False, 0, "cpu"


def _pick_best_gpu(device_count: int) -> str:
    """Select the CUDA device with the most free memory."""
    if device_count <= 1:
        return "cuda:0"
    try:
        import torch

        best_idx = 0
        best_free = 0
        for idx in range(device_count):
            free, _total = torch.cuda.mem_get_info(idx)
            if free > best_free:
                best_free = free
                best_idx = idx
        logger.info(
            "GPU selection: device cuda:%d has %.1f GiB free (best of %d)",
            best_idx,
            best_free / (1024**3),
            device_count,
        )
        return f"cuda:{best_idx}"
    except Exception:
        return "cuda:0"


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

    if force_reload and _cached_embed_model is not None:
        _cached_embed_model = None
        _cleanup_gpu_memory()

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


def _cleanup_gpu_memory() -> None:
    """Force garbage collection and release cached GPU memory."""
    import gc

    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.info("Cleared CUDA cache and ran GC")
    except ImportError:
        pass


def _build_local_embedding(model_name: str) -> BaseEmbedding:
    from llama_index.embeddings.huggingface import HuggingFaceEmbedding

    _inject_hf_env()
    _cleanup_gpu_memory()

    has_gpu, _count, device = detect_gpu(pinned_gpu_id=settings.embed_gpu_id)
    batch_size = settings.embed_batch_size
    logger.info("Loading local embedding model=%s device=%s batch_size=%d", model_name, device, batch_size)

    return HuggingFaceEmbedding(
        model_name=model_name,
        device=device,
        embed_batch_size=batch_size,
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
