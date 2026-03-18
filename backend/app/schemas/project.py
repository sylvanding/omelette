"""Pydantic schemas for Project CRUD operations."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PaperImportItem(BaseModel):
    """Schema for a single paper in project import."""

    title: str = ""
    abstract: str = ""
    doi: str | None = None
    authors: list | None = None
    year: int | None = None
    journal: str = ""
    source: str = ""
    pdf_url: str = ""
    status: str = ""
    citation_count: int = 0


class KeywordImportItem(BaseModel):
    """Schema for a single keyword in project import."""

    term: str = Field(..., min_length=1)
    term_en: str = ""
    level: int = 1
    category: str = ""
    synonyms: str = ""


class SubscriptionImportItem(BaseModel):
    """Schema for a single subscription in project import."""

    name: str = Field(..., min_length=1)
    query: str = ""
    sources: list[str] = Field(default_factory=list)
    frequency: str = "weekly"
    max_results: int = 50


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
