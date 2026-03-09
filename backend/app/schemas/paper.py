"""Pydantic schemas for Paper operations."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PaperCreate(BaseModel):
    doi: str | None = None
    title: str = Field(..., min_length=1)
    abstract: str = ""
    authors: list[dict[str, str]] | None = None
    journal: str = ""
    year: int | None = None
    citation_count: int = 0
    source: str = ""
    source_id: str = ""
    pdf_url: str = ""
    tags: list[str] | None = None


class PaperUpdate(BaseModel):
    title: str | None = None
    abstract: str | None = None
    authors: list[dict[str, str]] | None = None
    journal: str | None = None
    year: int | None = None
    tags: list[str] | None = None
    notes: str | None = None
    status: str | None = None


class PaperRead(BaseModel):
    id: int
    project_id: int
    doi: str | None
    title: str
    abstract: str
    authors: list[dict[str, str]] | None
    journal: str
    year: int | None
    citation_count: int
    source: str
    source_id: str
    pdf_path: str
    pdf_url: str
    status: str
    tags: list[str] | None
    notes: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaperBulkImport(BaseModel):
    papers: list[PaperCreate]
