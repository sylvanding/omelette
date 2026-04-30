"""Pydantic schemas for reading analytics and session tracking."""

from datetime import datetime

from pydantic import BaseModel, Field


class ReadingSessionCreate(BaseModel):
    paper_id: int
    started_at: datetime
    ended_at: datetime
    time_spent_seconds: int = Field(ge=0)
    pages_read: int | None = None


class ReadingSessionRead(BaseModel):
    id: int
    paper_id: int
    started_at: datetime
    ended_at: datetime
    time_spent_seconds: int
    pages_read: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CitationImpact(BaseModel):
    min: int
    max: int
    mean: float
    median: float
    p75: float


class KnowledgeGapItem(BaseModel):
    topic: str
    relevance_score: float
    paper_count: int


class KnowledgeGapAnalysis(BaseModel):
    gaps: list[KnowledgeGapItem]
    total_topics_analyzed: int
    coverage_score: float
