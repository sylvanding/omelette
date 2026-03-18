"""Project CRUD API endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_or_404
from app.models import Keyword, Paper, Project, Subscription
from app.schemas.common import ApiResponse, PaginatedData
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from app.services.pipeline_service import PipelineService

router = APIRouter(tags=["projects"])


class ProjectImportRequest(BaseModel):
    name: str
    description: str = ""
    domain: str = ""
    papers: list[dict] = []
    keywords: list[dict] = []
    subscriptions: list[dict] = []


@router.get("", response_model=ApiResponse[PaginatedData[ProjectRead]])
async def list_projects(
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    total_stmt = select(func.count(Project.id))
    total = (await db.execute(total_stmt)).scalar() or 0

    paper_count_sq = (
        select(func.count(Paper.id))
        .where(Paper.project_id == Project.id)
        .correlate(Project)
        .scalar_subquery()
        .label("paper_count")
    )
    kw_count_sq = (
        select(func.count(Keyword.id))
        .where(Keyword.project_id == Project.id)
        .correlate(Project)
        .scalar_subquery()
        .label("keyword_count")
    )
    stmt = (
        select(Project, paper_count_sq, kw_count_sq)
        .order_by(Project.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(stmt)

    items = []
    for p, paper_count, kw_count in result.all():
        items.append(
            ProjectRead(
                id=p.id,
                name=p.name,
                description=p.description,
                domain=p.domain,
                settings=p.settings,
                created_at=p.created_at,
                updated_at=p.updated_at,
                paper_count=paper_count or 0,
                keyword_count=kw_count or 0,
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
    project = await get_or_404(db, Project, project_id, detail="Project not found")
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
    project = await get_or_404(db, Project, project_id, detail="Project not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    await db.flush()
    await db.refresh(project)
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


@router.delete("/{project_id}", response_model=ApiResponse)
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    project = await get_or_404(db, Project, project_id, detail="Project not found")
    await db.delete(project)
    return ApiResponse(message="Project deleted")


@router.get("/{project_id}/export", response_model=ApiResponse[dict])
async def export_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Export project data as JSON (papers, keywords, subscriptions)."""
    project = await get_or_404(db, Project, project_id, detail="Project not found")

    papers = (await db.execute(select(Paper).where(Paper.project_id == project_id))).scalars().all()
    keywords = (await db.execute(select(Keyword).where(Keyword.project_id == project_id))).scalars().all()
    subs = (await db.execute(select(Subscription).where(Subscription.project_id == project_id))).scalars().all()

    return ApiResponse(
        data={
            "name": project.name,
            "description": project.description,
            "domain": project.domain,
            "papers": [
                {
                    "title": p.title,
                    "abstract": p.abstract,
                    "doi": p.doi,
                    "authors": p.authors,
                    "year": p.year,
                    "journal": p.journal,
                    "source": p.source,
                    "pdf_url": p.pdf_url,
                    "status": p.status,
                    "citation_count": p.citation_count,
                }
                for p in papers
            ],
            "keywords": [
                {"term": k.term, "term_en": k.term_en, "level": k.level, "category": k.category, "synonyms": k.synonyms}
                for k in keywords
            ],
            "subscriptions": [
                {
                    "name": s.name,
                    "query": s.query,
                    "sources": s.sources,
                    "frequency": s.frequency,
                    "max_results": s.max_results,
                }
                for s in subs
            ],
        }
    )


@router.post("/import", response_model=ApiResponse[ProjectRead], status_code=201)
async def import_project(body: ProjectImportRequest, db: AsyncSession = Depends(get_db)):
    """Import a previously exported project."""
    project = Project(name=body.name, description=body.description, domain=body.domain)
    db.add(project)
    await db.flush()

    paper_cols = {c.name for c in Paper.__table__.columns} - {"id", "project_id", "created_at", "updated_at"}
    kw_cols = {c.name for c in Keyword.__table__.columns} - {"id", "project_id", "created_at"}
    sub_cols = {c.name for c in Subscription.__table__.columns} - {"id", "project_id", "created_at", "updated_at"}

    for pd in body.papers:
        db.add(Paper(project_id=project.id, **{k: v for k, v in pd.items() if k in paper_cols}))

    for kd in body.keywords:
        db.add(Keyword(project_id=project.id, **{k: v for k, v in kd.items() if k in kw_cols}))

    for sd in body.subscriptions:
        db.add(Subscription(project_id=project.id, **{k: v for k, v in sd.items() if k in sub_cols}))

    await db.flush()
    await db.refresh(project)

    paper_count = (await db.execute(select(func.count(Paper.id)).where(Paper.project_id == project.id))).scalar() or 0
    kw_count = (await db.execute(select(func.count(Keyword.id)).where(Keyword.project_id == project.id))).scalar() or 0

    return ApiResponse(
        code=201,
        message="Project imported",
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
        ),
    )


@router.post("/{project_id}/pipeline/run", response_model=ApiResponse[dict])
async def run_pipeline(project_id: int, db: AsyncSession = Depends(get_db)):
    """Trigger the crawl → OCR → index pipeline for all pending papers."""
    await get_or_404(db, Project, project_id, detail="Project not found")
    svc = PipelineService(db)
    result = await svc.process_project_pending(project_id)
    return ApiResponse(data=result)


@router.post("/{project_id}/pipeline/paper/{paper_id}", response_model=ApiResponse[dict])
async def run_paper_pipeline(project_id: int, paper_id: int, db: AsyncSession = Depends(get_db)):
    """Trigger the pipeline for a single paper."""
    await get_or_404(db, Project, project_id, detail="Project not found")
    await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found in this project")
    svc = PipelineService(db)
    result = await svc.process_paper(paper_id)
    return ApiResponse(data=result)
