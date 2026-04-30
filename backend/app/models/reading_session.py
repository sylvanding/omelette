"""ReadingSession model for tracking individual reading sessions."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ReadingSession(Base):
    """A single reading session for a paper."""

    __tablename__ = "reading_sessions"
    __table_args__ = (
        Index("ix_reading_session_paper", "paper_id"),
        Index("ix_reading_session_paper_started", "paper_id", "started_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    paper_id: Mapped[int] = mapped_column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ended_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    time_spent_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    pages_read: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    paper = relationship("Paper")

    def __repr__(self) -> str:
        return f"<ReadingSession paper={self.paper_id} duration={self.time_spent_seconds}s>"
