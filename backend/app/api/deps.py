"""Shared FastAPI dependencies for dependency injection."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base, get_session
from app.models import Project
from app.models.team_member import TeamMember, TeamMemberRole
from app.services.llm.client import LLMClient, get_llm_client

ROLE_HIERARCHY = {
    TeamMemberRole.OWNER: 4,
    TeamMemberRole.ADMIN: 3,
    TeamMemberRole.EDITOR: 2,
    TeamMemberRole.VIEWER: 1,
}


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


def get_user_email(request: Request) -> str | None:
    """Extract current user email from request header.

    In production, this would come from JWT/session auth.
    For now, we read X-User-Email header (set by frontend auth layer).
    """
    return request.headers.get("x-user-email")


async def get_current_user_role(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user_email: str | None = Depends(get_user_email),
) -> str | None:
    """Look up the current user's role for the given project.

    Returns None if user_email is not set (single-user mode, backward compatible).
    """
    if not user_email:
        return None

    stmt = select(TeamMember).where(
        TeamMember.project_id == project_id,
        TeamMember.email == user_email.lower().strip(),
        TeamMember.status == "active",
    )
    result = await db.execute(stmt)
    member = result.scalars().first()
    return member.role if member else None


def require_role(minimum_role: str):
    """FastAPI dependency factory that enforces a minimum role level.

    Usage:
        @router.post("...", dependencies=[Depends(require_role(TeamMemberRole.EDITOR))])

    If no user email is set (single-user mode), access is granted.
    """
    min_level = ROLE_HIERARCHY.get(minimum_role, 0)

    async def _check_role(
        project_id: int,
        db: AsyncSession = Depends(get_db),
        user_email: str | None = Depends(get_user_email),
    ) -> None:
        if not user_email:
            return

        stmt = select(TeamMember).where(
            TeamMember.project_id == project_id,
            TeamMember.email == user_email.lower().strip(),
            TeamMember.status == "active",
        )
        result = await db.execute(stmt)
        member = result.scalars().first()

        if not member:
            raise HTTPException(status_code=403, detail="Access denied: not a project member")

        user_level = ROLE_HIERARCHY.get(member.role, 0)
        if user_level < min_level:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: requires {minimum_role} role or higher",
            )

    return _check_role


async def get_or_404[T: Base](
    db: AsyncSession,
    model: type[T],
    resource_id: int,
    *,
    project_id: int | None = None,
    detail: str = "Resource not found",
) -> T:
    """Fetch a model instance by primary key, raising 404 if missing or project mismatch."""
    obj = await db.get(model, resource_id)
    if not obj:
        raise HTTPException(status_code=404, detail=detail)
    obj_project_id = getattr(obj, "project_id", None)
    if project_id is not None and obj_project_id is not None and obj_project_id != project_id:
        raise HTTPException(status_code=404, detail=detail)
    return obj


async def get_project_or_404(project_id: int, db: AsyncSession) -> Project:
    """Fetch project by ID. Raises HTTPException 404 if not found."""
    return await get_or_404(db, Project, project_id, detail="Project not found")


async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
) -> Project:
    return await get_project_or_404(project_id, db)


def get_llm() -> LLMClient:
    return get_llm_client()
