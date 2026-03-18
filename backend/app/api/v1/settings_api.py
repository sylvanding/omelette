"""Application settings API — CRUD, model listing, and connection testing."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.common import ApiResponse
from app.schemas.llm import ProviderModelInfo, SettingsSchema, SettingsUpdateSchema
from app.services.user_settings_service import UserSettingsService, get_available_models

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=ApiResponse[SettingsSchema], summary="Get settings")
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Return merged settings (DB overrides .env); API keys are masked."""
    svc = UserSettingsService(db)
    merged = await svc.get_merged_settings(mask_sensitive=True)
    return ApiResponse(data=merged)


@router.put("", response_model=ApiResponse[SettingsSchema], summary="Update settings")
async def put_settings(
    payload: SettingsUpdateSchema,
    db: AsyncSession = Depends(get_db),
):
    """Update user-configurable settings and persist to DB."""
    svc = UserSettingsService(db)
    await svc.update(payload)
    merged = await svc.get_merged_settings(mask_sensitive=True)
    return ApiResponse(data=merged)


@router.get("/models", response_model=ApiResponse[list[ProviderModelInfo]], summary="List available models")
async def list_models():
    """Return available LLM providers and their model lists."""
    return ApiResponse(data=get_available_models())


@router.post("/test-connection", response_model=ApiResponse[dict], summary="Test LLM connection")
async def test_connection(db: AsyncSession = Depends(get_db)):
    """Test the current LLM configuration by sending a simple prompt."""
    svc = UserSettingsService(db)
    config = await svc.get_merged_llm_config()

    try:
        from app.services.llm.client import LLMClient

        client = LLMClient(config=config)
        response = await client.chat(
            [{"role": "user", "content": "Hi, respond with OK."}],
            task_type="connection_test",
        )
        return ApiResponse(data={"success": True, "response": response[:200]})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Connection test failed: {e}") from e


@router.get("/health", response_model=ApiResponse[dict], summary="Health check")
async def health_check():
    """Simple health check endpoint."""
    return ApiResponse(data={"status": "healthy", "version": "0.1.0"})
