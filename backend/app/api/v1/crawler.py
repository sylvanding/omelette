"""PDF crawler API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models import Paper, PaperStatus, Project
from app.schemas.common import ApiResponse
from app.services.crawler_service import CrawlerService

router = APIRouter(prefix="/projects/{project_id}/crawl", tags=["crawler"])


async def _ensure_project(project_id: int, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/start", response_model=ApiResponse[dict])
async def start_crawl(
    project_id: int,
    priority: str = "high",
    max_papers: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Start PDF download for papers that need PDFs."""
    await _ensure_project(project_id, db)

    stmt = (
        select(Paper)
        .where(Paper.project_id == project_id)
        .where(Paper.status.in_([PaperStatus.PENDING, PaperStatus.METADATA_ONLY]))
    )

    if priority == "high":
        stmt = stmt.order_by(Paper.citation_count.desc())
    else:
        stmt = stmt.order_by(Paper.created_at.desc())

    stmt = stmt.limit(max_papers)
    result = await db.execute(stmt)
    papers = list(result.scalars().all())

    if not papers:
        return ApiResponse(data={"message": "No papers to download", "total": 0})

    service = CrawlerService()
    download_results = await service.batch_download(papers)

    # Update paper statuses in DB
    for detail in download_results["details"]:
        if detail.get("success"):
            paper = await db.get(Paper, detail["paper_id"])
            if paper:
                paper.pdf_path = detail["file_path"]
                paper.status = PaperStatus.PDF_DOWNLOADED

    await db.flush()
    return ApiResponse(data=download_results)


@router.get("/stats", response_model=ApiResponse[dict])
async def crawl_stats(project_id: int, db: AsyncSession = Depends(get_db)):
    """Return download statistics for the project."""
    await _ensure_project(project_id, db)

    stats = {}
    for status in PaperStatus:
        count = (
            await db.execute(
                select(func.count(Paper.id)).where(
                    Paper.project_id == project_id, Paper.status == status
                )
            )
        ).scalar() or 0
        stats[status.value] = count

    service = CrawlerService()
    storage = service.get_storage_stats()

    return ApiResponse(data={**stats, "storage": storage})
