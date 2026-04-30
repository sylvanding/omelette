"""Team service — manage project membership, invites, and role-based access."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.team_member import TEAM_MEMBER_ROLES, TeamMember, TeamMemberRole


class TeamService:
    def __init__(self, db: AsyncSession, project_id: int):
        self.db = db
        self.project_id = project_id

    async def list_members(self) -> list[TeamMember]:
        stmt = select(TeamMember).where(TeamMember.project_id == self.project_id).order_by(TeamMember.created_at)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def invite_member(self, email: str, role: str, invited_by: str | None = None) -> TeamMember:
        existing = await self._find_by_email(email)
        if existing:
            raise ValueError(f"User {email} is already a member of this project")

        if role not in TEAM_MEMBER_ROLES:
            raise ValueError(f"Invalid role: {role}. Must be one of {TEAM_MEMBER_ROLES}")

        invite_code = uuid.uuid4().hex
        member = TeamMember(
            project_id=self.project_id,
            email=email.lower().strip(),
            role=role,
            status="active",
            invite_code=invite_code,
            invited_by=invited_by,
        )
        self.db.add(member)
        await self.db.flush()
        await self.db.refresh(member)
        return member

    async def update_member_role(self, member_id: int, new_role: str) -> TeamMember:
        member = await self._get_member(member_id)

        if member.role == TeamMemberRole.OWNER:
            raise ValueError("Cannot change the owner's role")

        if new_role not in TEAM_MEMBER_ROLES:
            raise ValueError(f"Invalid role: {new_role}. Must be one of {TEAM_MEMBER_ROLES}")

        member.role = new_role
        await self.db.flush()
        await self.db.refresh(member)
        return member

    async def remove_member(self, member_id: int) -> None:
        member = await self._get_member(member_id)

        if member.role == TeamMemberRole.OWNER:
            raise ValueError("Cannot remove the project owner")

        await self.db.delete(member)
        await self.db.flush()

    async def get_member(self, member_id: int) -> TeamMember:
        return await self._get_member(member_id)

    async def find_by_email(self, email: str) -> TeamMember | None:
        return await self._find_by_email(email)

    async def find_by_invite_code(self, code: str) -> TeamMember | None:
        stmt = select(TeamMember).where(
            TeamMember.invite_code == code,
            TeamMember.project_id == self.project_id,
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def _get_member(self, member_id: int) -> TeamMember:
        member = await self.db.get(TeamMember, member_id)
        if not member or member.project_id != self.project_id:
            raise ValueError("Team member not found")
        return member

    async def _find_by_email(self, email: str) -> TeamMember | None:
        stmt = select(TeamMember).where(
            TeamMember.project_id == self.project_id,
            TeamMember.email == email.lower().strip(),
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()
