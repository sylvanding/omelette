"""Pydantic schemas for Project CRUD operations."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    domain: str = ""
    settings: dict[str, Any] | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    domain: str | None = None
    settings: dict[str, Any] | None = None


class ProjectRead(BaseModel):
    id: int
    name: str
    description: str
    domain: str
    settings: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime
    paper_count: int = 0
    keyword_count: int = 0

    model_config = {"from_attributes": True}
