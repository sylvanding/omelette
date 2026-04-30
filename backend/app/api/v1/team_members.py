"""Team members API — CRUD for project membership."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Project, TeamMemberRole
from app.schemas.common import ApiResponse

router = APIRouter(tags=["team-members"])


class InviteRequest(BaseModel):
    email: EmailStr
    role: str = Field(default=TeamMemberRole.VIEWER, description="owner, admin, editor, or viewer")


class RoleUpdateRequest(BaseModel):
    role: str = Field(description="New role: admin, editor, or viewer")


class MemberResponse(BaseModel):
    id: int
    email: str
    role: str
    status: str
    invited_by: str | None = None
    created_at: str


@router.get(
    "",
    response_model=ApiResponse[list[MemberResponse]],
    summary="List project team members",
)
async def list_members(
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    from app.services.team_service import TeamService

    service = TeamService(db, project.id)
    members = await service.list_members()
    return ApiResponse(
        data=[
            MemberResponse(
                id=m.id,
                email=m.email,
                role=m.role,
                status=m.status,
                invited_by=m.invited_by,
                created_at=m.created_at.isoformat(),
            )
            for m in members
        ]
    )


@router.post(
    "",
    response_model=ApiResponse[MemberResponse],
    status_code=201,
    summary="Invite a team member",
)
async def invite_member(
    body: InviteRequest,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    from app.services.team_service import TeamService

    service = TeamService(db, project.id)
    try:
        member = await service.invite_member(body.email, body.role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return ApiResponse(
        data=MemberResponse(
            id=member.id,
            email=member.email,
            role=member.role,
            status=member.status,
            invited_by=member.invited_by,
            created_at=member.created_at.isoformat(),
        )
    )


@router.put(
    "/{member_id}",
    response_model=ApiResponse[MemberResponse],
    summary="Update a member's role",
)
async def update_member_role(
    member_id: int,
    body: RoleUpdateRequest,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    from app.services.team_service import TeamService

    service = TeamService(db, project.id)
    try:
        member = await service.update_member_role(member_id, body.role)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e)) from e
        raise HTTPException(status_code=400, detail=str(e)) from e

    return ApiResponse(
        data=MemberResponse(
            id=member.id,
            email=member.email,
            role=member.role,
            status=member.status,
            invited_by=member.invited_by,
            created_at=member.created_at.isoformat(),
        )
    )


@router.delete(
    "/{member_id}",
    response_model=ApiResponse[None],
    summary="Remove a team member",
)
async def remove_member(
    member_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    from app.services.team_service import TeamService

    service = TeamService(db, project.id)
    try:
        await service.remove_member(member_id)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e)) from e
        raise HTTPException(status_code=400, detail=str(e)) from e

    return ApiResponse(data=None)
