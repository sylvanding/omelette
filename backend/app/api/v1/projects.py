"""Project CRUD API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models import Keyword, Paper, Project
from app.schemas.common import ApiResponse, PaginatedData
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=ApiResponse[PaginatedData[ProjectRead]])
async def list_projects(
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    total_stmt = select(func.count(Project.id))
    total = (await db.execute(total_stmt)).scalar() or 0

    stmt = select(Project).order_by(Project.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    projects = result.scalars().all()

    items = []
    for p in projects:
        paper_count = (await db.execute(select(func.count(Paper.id)).where(Paper.project_id == p.id))).scalar() or 0
        kw_count = (await db.execute(select(func.count(Keyword.id)).where(Keyword.project_id == p.id))).scalar() or 0
        items.append(
            ProjectRead(
                id=p.id,
                name=p.name,
                description=p.description,
                domain=p.domain,
                settings=p.settings,
                created_at=p.created_at,
                updated_at=p.updated_at,
                paper_count=paper_count,
                keyword_count=kw_count,
            )
        )

    return ApiResponse(
        data=PaginatedData(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=(total + page_size - 1) // page_size if total else 1,
        )
    )


@router.post("", response_model=ApiResponse[ProjectRead], status_code=201)
async def create_project(body: ProjectCreate, db: AsyncSession = Depends(get_db)):
    project = Project(**body.model_dump())
    db.add(project)
    await db.flush()
    await db.refresh(project)
    return ApiResponse(
        code=201,
        message="Project created",
        data=ProjectRead(
            id=project.id,
            name=project.name,
            description=project.description,
            domain=project.domain,
            settings=project.settings,
            created_at=project.created_at,
            updated_at=project.updated_at,
        ),
    )


@router.get("/{project_id}", response_model=ApiResponse[ProjectRead])
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    paper_count = (await db.execute(select(func.count(Paper.id)).where(Paper.project_id == project_id))).scalar() or 0
    kw_count = (await db.execute(select(func.count(Keyword.id)).where(Keyword.project_id == project_id))).scalar() or 0
    return ApiResponse(
        data=ProjectRead(
            id=project.id,
            name=project.name,
            description=project.description,
            domain=project.domain,
            settings=project.settings,
            created_at=project.created_at,
            updated_at=project.updated_at,
            paper_count=paper_count,
            keyword_count=kw_count,
        )
    )


@router.put("/{project_id}", response_model=ApiResponse[ProjectRead])
async def update_project(project_id: int, body: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    await db.flush()
    await db.refresh(project)
    return ApiResponse(
        data=ProjectRead(
            id=project.id,
            name=project.name,
            description=project.description,
            domain=project.domain,
            settings=project.settings,
            created_at=project.created_at,
            updated_at=project.updated_at,
        )
    )


@router.delete("/{project_id}", response_model=ApiResponse)
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    return ApiResponse(message="Project deleted")
