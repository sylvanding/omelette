"""Pydantic schemas for augmented reading endpoints."""

from pydantic import BaseModel


class HighlightRequest(BaseModel):
    """Request body for generating skimming highlights."""

    paper_content: str


class HighlightItem(BaseModel):
    """A single skimming highlight."""

    category: str
    text: str
    page: int
    start_offset: int
    end_offset: int


class HighlightResponse(BaseModel):
    """Response from highlight generation."""

    highlights: list[HighlightItem]


class CitationCardItem(BaseModel):
    """A single citation card with TLDR."""

    paper_id: int | None
    paper_title: str
    tldr: str
    doi: str | None


class CitationCardResponse(BaseModel):
    """Response from citation card generation."""

    cards: list[CitationCardItem]


class DefinitionItem(BaseModel):
    """A single term definition."""

    term: str
    definition: str
    context: str


class DefinitionResponse(BaseModel):
    """Response from definition generation."""

    definitions: list[DefinitionItem]
