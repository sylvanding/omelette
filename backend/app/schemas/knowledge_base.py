"""Pydantic schemas for knowledge base and PDF upload operations."""

from pydantic import BaseModel

from app.schemas.paper import PaperRead


class NewPaperData(BaseModel):
    title: str
    abstract: str = ""
    authors: list[dict[str, str]] | None = None
    doi: str | None = None
    year: int | None = None
    journal: str = ""
    pdf_path: str = ""
    source: str = "pdf_upload"


class DedupConflictPair(BaseModel):
    conflict_id: str
    old_paper: PaperRead
    new_paper: NewPaperData
    reason: str  # "doi_duplicate" | "title_similarity"
    similarity: float | None = None


class UploadResult(BaseModel):
    papers: list[NewPaperData]  # non-conflicting papers ready to import
    conflicts: list[DedupConflictPair]
    total_uploaded: int


class ResolveConflictRequest(BaseModel):
    conflict_id: str
    action: str  # "keep_old" | "keep_new" | "merge" | "skip"
    merged_paper: dict | None = None


class AutoResolveRequest(BaseModel):
    conflict_ids: list[str] | None = None  # None = all
