"""Shared FastAPI dependencies for dependency injection."""

from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import Project
from app.services.llm_client import LLMClient, get_llm_client


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


async def get_project_or_404(project_id: int, db: AsyncSession) -> Project:
    """Fetch project by ID. Raises HTTPException 404 if not found. Use when project_id comes from body/query."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
) -> Project:
    return await get_project_or_404(project_id, db)


def get_llm() -> LLMClient:
    return get_llm_client()
