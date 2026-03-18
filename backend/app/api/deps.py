"""Shared FastAPI dependencies for dependency injection."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base, get_session
from app.models import Project
from app.services.llm.client import LLMClient, get_llm_client


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


async def get_or_404[T: Base](
    db: AsyncSession,
    model: type[T],
    resource_id: int,
    *,
    project_id: int | None = None,
    detail: str = "Resource not found",
) -> T:
    """Fetch a model instance by primary key, raising 404 if missing or project mismatch."""
    obj = await db.get(model, resource_id)
    if not obj:
        raise HTTPException(status_code=404, detail=detail)
    obj_project_id = getattr(obj, "project_id", None)
    if project_id is not None and obj_project_id is not None and obj_project_id != project_id:
        raise HTTPException(status_code=404, detail=detail)
    return obj


async def get_project_or_404(project_id: int, db: AsyncSession) -> Project:
    """Fetch project by ID. Raises HTTPException 404 if not found."""
    return await get_or_404(db, Project, project_id, detail="Project not found")


async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
) -> Project:
    return await get_project_or_404(project_id, db)


def get_llm() -> LLMClient:
    return get_llm_client()
