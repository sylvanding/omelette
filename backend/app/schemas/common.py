"""Common response schemas used across all API endpoints."""

from datetime import UTC, datetime
from typing import Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginationParams:
    """FastAPI dependency for pagination (page, page_size)."""

    def __init__(
        self,
        page: int = Query(1, ge=1, description="页码"),
        page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    ):
        self.page = page
        self.page_size = page_size


class KeywordPaginationParams(PaginationParams):
    """Pagination for keywords (page_size default 50 for backward compatibility)."""

    def __init__(
        self,
        page: int = Query(1, ge=1, description="页码"),
        page_size: int = Query(50, ge=1, le=100, description="每页数量"),
    ):
        self.page = page
        self.page_size = page_size


class ApiResponse(BaseModel, Generic[T]):
    code: int = 200
    message: str = "success"
    data: T | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PaginatedData(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int = 1
    page_size: int = 20
    total_pages: int = 1


class TaskResponse(BaseModel):
    task_id: int
    status: str
    message: str = ""
