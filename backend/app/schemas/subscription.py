"""Subscription schemas for request/response."""

from datetime import datetime

from pydantic import BaseModel, Field


class SubscriptionCreate(BaseModel):
    name: str = Field(..., min_length=1)
    query: str = ""
    sources: list[str] = []
    frequency: str = "weekly"
    max_results: int = Field(50, ge=1, le=200)


class SubscriptionUpdate(BaseModel):
    name: str | None = None
    query: str | None = None
    sources: list[str] | None = None
    frequency: str | None = None
    max_results: int | None = None
    is_active: bool | None = None


class SubscriptionRead(BaseModel):
    id: int
    project_id: int
    name: str
    query: str
    sources: list[str]
    frequency: str
    max_results: int
    is_active: bool
    last_run_at: datetime | None
    total_found: int
    created_at: datetime | None
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class SubscriptionRunResult(BaseModel):
    new_papers: int
    total_checked: int
    sources_searched: list[str]
