"""Team member model — project membership with role-based access control."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TeamMemberRole:
    """Role constants for team members."""

    OWNER = "owner"
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


TEAM_MEMBER_ROLES = (TeamMemberRole.OWNER, TeamMemberRole.ADMIN, TeamMemberRole.EDITOR, TeamMemberRole.VIEWER)


class TeamMember(Base):
    __tablename__ = "team_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default=TeamMemberRole.VIEWER)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    invite_code: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    invited_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="team_members")

    def __repr__(self) -> str:
        return f"<TeamMember project_id={self.project_id} email={self.email!r} role={self.role!r}>"
