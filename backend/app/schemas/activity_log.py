"""Pydantic schemas for activity log."""

from datetime import datetime

from pydantic import BaseModel


class ActivityRead(BaseModel):
    id: int
    project_id: int
    action: str
    entity_type: str
    entity_id: int
    actor: str
    details: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}
