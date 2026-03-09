"""Pydantic schemas for Keyword operations."""

from datetime import datetime

from pydantic import BaseModel, Field


class KeywordCreate(BaseModel):
    term: str = Field(..., min_length=1, max_length=500)
    term_en: str = ""
    level: int = Field(default=1, ge=1, le=3)
    category: str = ""
    parent_id: int | None = None
    synonyms: str = ""


class KeywordUpdate(BaseModel):
    term: str | None = Field(default=None, min_length=1, max_length=500)
    term_en: str | None = None
    level: int | None = Field(default=None, ge=1, le=3)
    category: str | None = None
    parent_id: int | None = None
    synonyms: str | None = None


class KeywordRead(BaseModel):
    id: int
    project_id: int
    term: str
    term_en: str
    level: int
    category: str
    parent_id: int | None
    synonyms: str
    created_at: datetime
    children: list["KeywordRead"] = []

    model_config = {"from_attributes": True}


class KeywordExpandRequest(BaseModel):
    seed_terms: list[str]
    language: str = "en"
    max_results: int = 20


class KeywordExpandResponse(BaseModel):
    expanded_terms: list[dict[str, str]]
    source: str = "llm"
