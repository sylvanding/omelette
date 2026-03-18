"""Pydantic schemas for Paper operations."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PaperCreate(BaseModel):
    doi: str | None = None
    title: str = Field(..., min_length=1, max_length=2000)
    abstract: str = Field(default="", max_length=50000)
    authors: list[dict[str, str]] | None = None
    journal: str = Field(default="", max_length=500)
    year: int | None = Field(default=None, ge=1800, le=2100)
    citation_count: int = Field(default=0, ge=0)
    source: str = Field(default="", max_length=200)
    source_id: str = Field(default="", max_length=500)
    pdf_url: str = Field(default="", max_length=5000)
    tags: list[str] | None = None


class PaperUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=2000)
    abstract: str | None = Field(default=None, max_length=50000)
    authors: list[dict[str, str]] | None = None
    journal: str | None = Field(default=None, max_length=500)
    year: int | None = Field(default=None, ge=1800, le=2100)
    tags: list[str] | None = None
    notes: str | None = None
    status: Literal["pending", "metadata_only", "pdf_downloaded", "ocr_complete", "indexed", "error"] | None = None


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
    papers: list[PaperCreate] = Field(..., max_length=500)


class PaperBatchDeleteRequest(BaseModel):
    paper_ids: list[int] = Field(..., min_length=1, max_length=500)
