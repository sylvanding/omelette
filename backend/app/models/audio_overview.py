"""Audio overview model — stores generated audio dialogue scripts for papers."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AudioOverview(Base):
    __tablename__ = "audio_overviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    duration_estimate: Mapped[str] = mapped_column(String(50), default="")
    tone: Mapped[str] = mapped_column(String(20), default="conversational")
    focus_areas: Mapped[list] = mapped_column(String(500), default="[]")
    paper_ids: Mapped[list] = mapped_column(String(500), default="[]")
    paper_count: Mapped[int] = mapped_column(Integer, default=0)
    avg_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project = relationship("Project")

    def __repr__(self) -> str:
        return f"<AudioOverview id={self.id} title={self.title!r}>"
