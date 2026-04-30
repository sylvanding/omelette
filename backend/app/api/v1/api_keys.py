"""API keys CRUD — manage programmatic access keys."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.api_key import APIKeyScope
from app.schemas.common import ApiResponse

router = APIRouter(tags=["api-keys"])


class CreateKeyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scope: str = Field(default=APIKeyScope.READ, description="read, write, or admin")


class KeyResponse(BaseModel):
    id: int
    name: str
    key_prefix: str
    scope: str
    is_active: bool
    last_used_at: str | None = None
    created_at: str


class CreateKeyResponse(BaseModel):
    id: int
    name: str
    key: str
    key_prefix: str
    scope: str
    is_active: bool
    created_at: str


@router.get(
    "",
    response_model=ApiResponse[list[KeyResponse]],
    summary="List all API keys",
)
async def list_keys(db: AsyncSession = Depends(get_db)):
    from app.services.api_key_service import APIKeyService

    service = APIKeyService(db)
    keys = await service.list_keys()
    return ApiResponse(
        data=[
            KeyResponse(
                id=k.id,
                name=k.name,
                key_prefix=k.key_prefix,
                scope=k.scope,
                is_active=k.is_active,
                last_used_at=k.last_used_at.isoformat() if k.last_used_at else None,
                created_at=k.created_at.isoformat(),
            )
            for k in keys
        ]
    )


@router.post(
    "",
    response_model=ApiResponse[CreateKeyResponse],
    status_code=201,
    summary="Generate a new API key",
)
async def create_key(body: CreateKeyRequest, db: AsyncSession = Depends(get_db)):
    from app.services.api_key_service import APIKeyService

    service = APIKeyService(db)
    try:
        api_key, raw_key = await service.create_key(body.name, body.scope)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return ApiResponse(
        data=CreateKeyResponse(
            id=api_key.id,
            name=api_key.name,
            key=raw_key,
            key_prefix=api_key.key_prefix,
            scope=api_key.scope,
            is_active=api_key.is_active,
            created_at=api_key.created_at.isoformat(),
        )
    )


@router.post(
    "/{key_id}/revoke",
    response_model=ApiResponse[KeyResponse],
    summary="Revoke an API key",
)
async def revoke_key(key_id: int, db: AsyncSession = Depends(get_db)):
    from app.services.api_key_service import APIKeyService

    service = APIKeyService(db)
    try:
        api_key = await service.revoke_key(key_id)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e)) from e
        raise HTTPException(status_code=400, detail=str(e)) from e

    return ApiResponse(
        data=KeyResponse(
            id=api_key.id,
            name=api_key.name,
            key_prefix=api_key.key_prefix,
            scope=api_key.scope,
            is_active=api_key.is_active,
            last_used_at=api_key.last_used_at.isoformat() if api_key.last_used_at else None,
            created_at=api_key.created_at.isoformat(),
        )
    )


@router.delete(
    "/{key_id}",
    response_model=ApiResponse[None],
    summary="Delete an API key permanently",
)
async def delete_key(key_id: int, db: AsyncSession = Depends(get_db)):
    from app.services.api_key_service import APIKeyService

    service = APIKeyService(db)
    try:
        await service.delete_key(key_id)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e)) from e
        raise HTTPException(status_code=400, detail=str(e)) from e

    return ApiResponse(data=None)
