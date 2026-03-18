"""Pydantic schemas for PaperChunk."""

from datetime import datetime

from pydantic import BaseModel


class ChunkRead(BaseModel):
    id: int
    paper_id: int
    chunk_type: str
    content: str
    section: str
    page_number: int | None
    chunk_index: int
    token_count: int
    has_formula: bool
    figure_path: str
    created_at: datetime

    model_config = {"from_attributes": True}
