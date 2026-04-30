"""Review model for systematic review workflow with data extraction."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Review(Base):
    """A systematic review with custom extraction columns."""

    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    research_question: Mapped[str] = mapped_column(Text, default="")
    columns: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of column definitions
    paper_ids: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of paper IDs
    extraction_status: Mapped[str] = mapped_column(
        String(50), default="pending"
    )  # pending, in_progress, complete, failed
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", backref="reviews")
    extractions = relationship("ReviewExtraction", back_populates="review", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Review id={self.id} title={self.title!r}>"


class ReviewExtraction(Base):
    """Extracted data for a single paper in a review."""

    __tablename__ = "review_extractions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    review_id: Mapped[int] = mapped_column(Integer, ForeignKey("reviews.id"), nullable=False, index=True)
    paper_id: Mapped[int] = mapped_column(Integer, ForeignKey("papers.id"), nullable=False, index=True)
    extracted_data: Mapped[str] = mapped_column(Text, default="{}")  # JSON dict of column_name -> value
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, complete, failed
    error_message: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    review = relationship("Review", back_populates="extractions")
    paper = relationship("Paper")

    def __repr__(self) -> str:
        return f"<ReviewExtraction review={self.review_id} paper={self.paper_id}>"
