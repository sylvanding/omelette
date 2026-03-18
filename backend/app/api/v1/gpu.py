"""GPU resource monitoring and management API."""

from __future__ import annotations

import logging

from fastapi import APIRouter

from app.schemas.common import ApiResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gpu", tags=["gpu"])


def _get_gpu_memory() -> list[dict]:
    """Query GPU memory info via torch.cuda (returns empty list if unavailable)."""
    try:
        import torch

        if not torch.cuda.is_available():
            return []

        import os

        cuda_ids = os.environ.get("CUDA_VISIBLE_DEVICES", "")
        physical_ids = [int(x.strip()) for x in cuda_ids.split(",") if x.strip()] if cuda_ids else []

        result = []
        for idx in range(torch.cuda.device_count()):
            free, total = torch.cuda.mem_get_info(idx)
            used = total - free
            gpu_id = physical_ids[idx] if idx < len(physical_ids) else idx
            result.append(
                {
                    "gpu_id": gpu_id,
                    "total_mb": round(total / (1024 * 1024)),
                    "used_mb": round(used / (1024 * 1024)),
                    "free_mb": round(free / (1024 * 1024)),
                }
            )
        return result
    except (ImportError, RuntimeError):
        return []


@router.get("/status", summary="Get GPU status")
async def gpu_status():
    """Return loaded GPU models, MinerU status, and GPU memory usage."""
    from app.services.gpu_model_manager import gpu_model_manager
    from app.services.mineru_process_manager import mineru_process_manager

    return ApiResponse(
        data={
            "models": gpu_model_manager.get_status(),
            "mineru": mineru_process_manager.get_status(),
            "gpu_memory": _get_gpu_memory(),
        }
    )


@router.post("/unload", summary="Unload GPU models")
async def gpu_unload():
    """Immediately unload all GPU models and release VRAM."""
    from app.services.gpu_model_manager import gpu_model_manager

    names = list(gpu_model_manager.loaded_model_names)
    gpu_model_manager.unload_all()
    logger.info("Manual unload: released models %s", names)
    return ApiResponse(data={"unloaded": names})
