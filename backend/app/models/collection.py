"""Collection model — a user-created grouping of papers within a project."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(20), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", backref="collections")
    papers = relationship("CollectionPaper", back_populates="collection", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Collection id={self.id} name={self.name!r}>"


class CollectionPaper(Base):
    """Junction table linking collections to papers."""

    __tablename__ = "collection_papers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    collection_id: Mapped[int] = mapped_column(Integer, ForeignKey("collections.id"), nullable=False, index=True)
    paper_id: Mapped[int] = mapped_column(Integer, ForeignKey("papers.id"), nullable=False, index=True)
    added_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    collection = relationship("Collection", back_populates="papers")
    paper = relationship("Paper")

    def __repr__(self) -> str:
        return f"<CollectionPaper collection={self.collection_id} paper={self.paper_id}>"
