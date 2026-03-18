"""Paper CRUD and management API endpoints."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_or_404, get_project
from app.config import settings
from app.models import Paper, Project
from app.models.chunk import PaperChunk
from app.schemas.chunk import ChunkRead
from app.schemas.common import ApiResponse, PaginatedData, PaginationParams
from app.schemas.paper import PaperBatchDeleteRequest, PaperBulkImport, PaperCreate, PaperRead, PaperUpdate

router = APIRouter(tags=["papers"])


@router.get("", response_model=ApiResponse[PaginatedData[PaperRead]])
async def list_papers(
    project_id: int,
    pagination: PaginationParams = Depends(),
    status: str | None = None,
    year: int | None = None,
    q: str | None = Query(default=None, description="Search title/abstract"),
    sort_by: str = "created_at",
    order: str = "desc",
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    page, page_size = pagination.page, pagination.page_size
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

    allowed_sort = {"id", "title", "year", "created_at", "updated_at", "citation_count", "source"}
    sort_col = getattr(Paper, sort_by) if sort_by in allowed_sort else Paper.created_at
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
async def create_paper(
    project_id: int,
    body: PaperCreate,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    paper = Paper(project_id=project_id, **body.model_dump())
    db.add(paper)
    await db.flush()
    await db.refresh(paper)
    return ApiResponse(code=201, message="Paper created", data=PaperRead.model_validate(paper))


@router.post("/bulk", response_model=ApiResponse[dict])
async def bulk_import_papers(
    project_id: int,
    body: PaperBulkImport,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
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


@router.post("/batch-delete", response_model=ApiResponse[dict])
async def batch_delete_papers(
    project_id: int,
    body: PaperBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Delete multiple papers at once."""
    stmt = select(Paper).where(
        Paper.project_id == project_id,
        Paper.id.in_(body.paper_ids),
    )
    result = await db.execute(stmt)
    papers = list(result.scalars().all())
    for paper in papers:
        await db.delete(paper)
    await db.flush()
    return ApiResponse(data={"deleted": len(papers), "requested": len(body.paper_ids)})


@router.get("/{paper_id}", response_model=ApiResponse[PaperRead])
async def get_paper(
    project_id: int,
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    paper = await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")
    return ApiResponse(data=PaperRead.model_validate(paper))


@router.put("/{paper_id}", response_model=ApiResponse[PaperRead])
async def update_paper(
    project_id: int,
    paper_id: int,
    body: PaperUpdate,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    paper = await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(paper, key, value)
    await db.flush()
    await db.refresh(paper)
    return ApiResponse(data=PaperRead.model_validate(paper))


@router.delete("/{paper_id}", response_model=ApiResponse)
async def delete_paper(
    project_id: int,
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    paper = await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")
    await db.delete(paper)
    return ApiResponse(message="Paper deleted")


@router.get("/{paper_id}/pdf")
async def serve_pdf(
    project_id: int,
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Serve the PDF file for a paper."""
    paper = await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")
    if not paper.pdf_path or not Path(paper.pdf_path).exists():
        raise HTTPException(status_code=404, detail="PDF file not available")

    pdf_path = Path(paper.pdf_path).resolve()
    pdf_dir = Path(settings.pdf_dir).resolve()
    if not str(pdf_path).startswith(str(pdf_dir)):
        raise HTTPException(status_code=403, detail="Access denied")

    with open(pdf_path, "rb") as f:
        magic = f.read(5)
    if magic != b"%PDF-":
        raise HTTPException(status_code=400, detail="Invalid PDF file")

    return FileResponse(str(pdf_path), media_type="application/pdf", filename=f"{paper.title[:80]}.pdf")


@router.get("/{paper_id}/chunks", response_model=ApiResponse[PaginatedData[ChunkRead]])
async def list_paper_chunks(
    project_id: int,
    paper_id: int,
    page: int = 1,
    page_size: int = Query(default=50, ge=1, le=200),
    chunk_type: str | None = Query(default=None, description="Filter by chunk type"),
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """List chunks for a specific paper."""
    await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")

    base = select(PaperChunk).where(PaperChunk.paper_id == paper_id)
    count_base = select(func.count(PaperChunk.id)).where(PaperChunk.paper_id == paper_id)

    if chunk_type:
        base = base.where(PaperChunk.chunk_type == chunk_type)
        count_base = count_base.where(PaperChunk.chunk_type == chunk_type)

    total = (await db.execute(count_base)).scalar() or 0
    base = base.order_by(PaperChunk.chunk_index).offset((page - 1) * page_size).limit(page_size)
    chunks = (await db.execute(base)).scalars().all()

    return ApiResponse(
        data=PaginatedData(
            items=[ChunkRead.model_validate(c) for c in chunks],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=(total + page_size - 1) // page_size if total else 1,
        )
    )


@router.get("/{paper_id}/citation-graph", response_model=ApiResponse)
async def get_citation_graph(
    project_id: int,
    paper_id: int,
    depth: int = Query(1, ge=1, le=2),
    max_nodes: int = Query(50, ge=10, le=200),
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Get citation relationship graph for a paper via Semantic Scholar."""
    from app.services.citation_graph_service import CitationGraphService

    svc = CitationGraphService(db)
    graph = await svc.get_citation_graph(paper_id, project_id, depth=depth, max_nodes=max_nodes)
    return ApiResponse(data=graph)
