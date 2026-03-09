"""PaperChunk model — a semantically meaningful segment of a paper."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PaperChunk(Base):
    __tablename__ = "paper_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    paper_id: Mapped[int] = mapped_column(Integer, ForeignKey("papers.id"), nullable=False, index=True)
    chunk_type: Mapped[str] = mapped_column(String(50), default="text")  # text, table, formula, figure_caption
    content: Mapped[str] = mapped_column(Text, nullable=False)
    section: Mapped[str] = mapped_column(String(500), default="")
    page_number: Mapped[int | None] = mapped_column(Integer, default=None)
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    chroma_id: Mapped[str] = mapped_column(String(255), default="", index=True)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    paper = relationship("Paper", back_populates="chunks")

    def __repr__(self) -> str:
        return f"<PaperChunk id={self.id} paper_id={self.paper_id} type={self.chunk_type}>"
