"""GPU memory utilities — shared cleanup logic for embedding, OCR, and model manager."""

import gc
import logging

logger = logging.getLogger(__name__)


def release_gpu_memory(caller: str = "") -> None:
    """Force garbage collection and release cached GPU memory."""
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.info("%s: released GPU memory", caller or "gpu_utils")
    except ImportError:
        pass
