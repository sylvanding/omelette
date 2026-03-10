"""Application settings API — manage API keys and configuration."""

from fastapi import APIRouter

from app.config import settings
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=ApiResponse[dict])
async def get_settings():
    """Return non-sensitive settings (masks API keys)."""

    def _mask(key: str) -> str:
        if not key:
            return ""
        if len(key) <= 8:
            return "***"
        return key[:4] + "***" + key[-4:]

    return ApiResponse(
        data={
            "llm_provider": settings.llm_provider,
            "aliyun_api_key": _mask(settings.aliyun_api_key),
            "aliyun_base_url": settings.aliyun_base_url,
            "aliyun_model": settings.aliyun_model,
            "volcengine_api_key": _mask(settings.volcengine_api_key),
            "volcengine_base_url": settings.volcengine_base_url,
            "volcengine_model": settings.volcengine_model,
            "embedding_model": settings.embedding_model,
            "reranker_model": settings.reranker_model,
            "data_dir": settings.data_dir,
            "cuda_visible_devices": settings.cuda_visible_devices,
            "semantic_scholar_api_key": _mask(settings.semantic_scholar_api_key),
            "unpaywall_email": settings.unpaywall_email,
        }
    )


@router.get("/health", response_model=ApiResponse[dict])
async def health_check():
    """Simple health check endpoint."""
    return ApiResponse(data={"status": "healthy", "version": "0.1.0"})
