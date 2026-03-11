"""Conversation model — a chat session with optional knowledge base context."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    knowledge_base_ids: Mapped[list | None] = mapped_column(JSON, default=None)
    model: Mapped[str] = mapped_column(String(100), default="")
    tool_mode: Mapped[str] = mapped_column(String(50), default="qa")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    messages: Mapped[list["Message"]] = relationship(  # noqa: F821
        "Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )

    def __repr__(self) -> str:
        return f"<Conversation id={self.id} title={self.title!r}>"
