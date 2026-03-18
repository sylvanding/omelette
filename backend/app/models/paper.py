"""Paper model — a single scientific literature record."""

from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PaperStatus(StrEnum):
    PENDING = "pending"
    METADATA_ONLY = "metadata_only"
    PDF_DOWNLOADED = "pdf_downloaded"
    OCR_COMPLETE = "ocr_complete"
    INDEXED = "indexed"
    ERROR = "error"


class Paper(Base):
    __tablename__ = "papers"
    __table_args__ = (
        Index("ix_paper_project_status", "project_id", "status"),
        UniqueConstraint("project_id", "doi", name="uq_paper_project_doi"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    doi: Mapped[str | None] = mapped_column(String(255), index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    abstract: Mapped[str] = mapped_column(Text, default="")
    authors: Mapped[list | None] = mapped_column(JSON, default=None)
    journal: Mapped[str] = mapped_column(String(500), default="")
    year: Mapped[int | None] = mapped_column(Integer, index=True)
    citation_count: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(100), default="")
    source_id: Mapped[str] = mapped_column(String(255), default="")
    pdf_path: Mapped[str] = mapped_column(String(1000), default="")
    pdf_url: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(50), default=PaperStatus.PENDING)
    tags: Mapped[list | None] = mapped_column(JSON, default=None)
    notes: Mapped[str] = mapped_column(Text, default="")
    extra_metadata: Mapped[dict | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="papers")
    chunks = relationship("PaperChunk", back_populates="paper", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Paper id={self.id} doi={self.doi!r} title={self.title[:50]!r}>"
