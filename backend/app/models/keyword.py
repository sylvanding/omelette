"""Keyword model — search terms organized in a three-level hierarchy."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Keyword(Base):
    __tablename__ = "keywords"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    term: Mapped[str] = mapped_column(String(500), nullable=False)
    term_en: Mapped[str] = mapped_column(String(500), default="")
    level: Mapped[int] = mapped_column(Integer, default=1)  # 1=core, 2=sub-domain, 3=expanded
    category: Mapped[str] = mapped_column(String(100), default="")
    parent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("keywords.id"), default=None, index=True)
    synonyms: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="keywords")
    parent = relationship("Keyword", remote_side="Keyword.id", backref="children")

    def __repr__(self) -> str:
        return f"<Keyword id={self.id} term={self.term!r} level={self.level}>"
