"""Shared FastAPI dependencies for dependency injection."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.services.llm_client import LLMClient, get_llm_client


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


def get_llm() -> LLMClient:
    return get_llm_client()
