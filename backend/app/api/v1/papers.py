"""Paper CRUD and management API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models import Paper, Project
from app.schemas.common import ApiResponse, PaginatedData
from app.schemas.paper import PaperBulkImport, PaperCreate, PaperRead, PaperUpdate

router = APIRouter(tags=["papers"])


async def _ensure_project(project_id: int, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=ApiResponse[PaginatedData[PaperRead]])
async def list_papers(
    project_id: int,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    year: int | None = None,
    q: str | None = Query(default=None, description="Search title/abstract"),
    sort_by: str = "created_at",
    order: str = "desc",
    db: AsyncSession = Depends(get_db),
):
    await _ensure_project(project_id, db)

    base = select(Paper).where(Paper.project_id == project_id)
    count_base = select(func.count(Paper.id)).where(Paper.project_id == project_id)

    if status:
        base = base.where(Paper.status == status)
        count_base = count_base.where(Paper.status == status)
    if year:
        base = base.where(Paper.year == year)
        count_base = count_base.where(Paper.year == year)
    if q:
        like_q = f"%{q}%"
        base = base.where(Paper.title.ilike(like_q) | Paper.abstract.ilike(like_q))
        count_base = count_base.where(Paper.title.ilike(like_q) | Paper.abstract.ilike(like_q))

    total = (await db.execute(count_base)).scalar() or 0

    sort_col = getattr(Paper, sort_by, Paper.created_at)
    base = base.order_by(sort_col.asc() if order == "asc" else sort_col.desc())

    base = base.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(base)
    papers = result.scalars().all()

    return ApiResponse(
        data=PaginatedData(
            items=[PaperRead.model_validate(p) for p in papers],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=(total + page_size - 1) // page_size if total else 1,
        )
    )


@router.post("", response_model=ApiResponse[PaperRead], status_code=201)
async def create_paper(project_id: int, body: PaperCreate, db: AsyncSession = Depends(get_db)):
    await _ensure_project(project_id, db)
    paper = Paper(project_id=project_id, **body.model_dump())
    db.add(paper)
    await db.flush()
    await db.refresh(paper)
    return ApiResponse(code=201, message="Paper created", data=PaperRead.model_validate(paper))


@router.post("/bulk", response_model=ApiResponse[dict])
async def bulk_import_papers(project_id: int, body: PaperBulkImport, db: AsyncSession = Depends(get_db)):
    await _ensure_project(project_id, db)
    created = 0
    skipped = 0
    for paper_data in body.papers:
        if paper_data.doi:
            existing = (
                await db.execute(select(Paper).where(Paper.project_id == project_id, Paper.doi == paper_data.doi))
            ).scalar_one_or_none()
            if existing:
                skipped += 1
                continue
        paper = Paper(project_id=project_id, **paper_data.model_dump())
        db.add(paper)
        created += 1
    await db.flush()
    return ApiResponse(data={"created": created, "skipped": skipped, "total": len(body.papers)})


@router.get("/{paper_id}", response_model=ApiResponse[PaperRead])
async def get_paper(project_id: int, paper_id: int, db: AsyncSession = Depends(get_db)):
    await _ensure_project(project_id, db)
    paper = await db.get(Paper, paper_id)
    if not paper or paper.project_id != project_id:
        raise HTTPException(status_code=404, detail="Paper not found")
    return ApiResponse(data=PaperRead.model_validate(paper))


@router.put("/{paper_id}", response_model=ApiResponse[PaperRead])
async def update_paper(project_id: int, paper_id: int, body: PaperUpdate, db: AsyncSession = Depends(get_db)):
    await _ensure_project(project_id, db)
    paper = await db.get(Paper, paper_id)
    if not paper or paper.project_id != project_id:
        raise HTTPException(status_code=404, detail="Paper not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(paper, key, value)
    await db.flush()
    await db.refresh(paper)
    return ApiResponse(data=PaperRead.model_validate(paper))


@router.delete("/{paper_id}", response_model=ApiResponse)
async def delete_paper(project_id: int, paper_id: int, db: AsyncSession = Depends(get_db)):
    await _ensure_project(project_id, db)
    paper = await db.get(Paper, paper_id)
    if not paper or paper.project_id != project_id:
        raise HTTPException(status_code=404, detail="Paper not found")
    await db.delete(paper)
    return ApiResponse(message="Paper deleted")
