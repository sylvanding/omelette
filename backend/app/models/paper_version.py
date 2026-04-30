"""Paper version tracking — preprint and journal version lineage."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PaperVersion(Base):
    __tablename__ = "paper_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    paper_id: Mapped[int] = mapped_column(Integer, ForeignKey("papers.id"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    doi: Mapped[str | None] = mapped_column(String(255), index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    abstract: Mapped[str] = mapped_column(Text, default="")
    authors: Mapped[list | None] = mapped_column(JSON, default=None)
    journal: Mapped[str] = mapped_column(String(500), default="")
    year: Mapped[int | None] = mapped_column(Integer, default=None)
    citation_count: Mapped[int] = mapped_column(Integer, default=0)
    pdf_url: Mapped[str | None] = mapped_column(Text, default=None)
    is_preprint: Mapped[bool] = mapped_column(default=True)
    preprint_server: Mapped[str | None] = mapped_column(String(100), default=None)
    diff_summary: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    paper = relationship("Paper", back_populates="versions")

    def __repr__(self) -> str:
        return f"<PaperVersion paper_id={self.paper_id} v{self.version} source={self.source!r}>"
