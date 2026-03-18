"""PDF crawler API endpoints."""

from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Paper, PaperStatus, Project
from app.schemas.common import ApiResponse
from app.services.crawler_service import CrawlerService

router = APIRouter(prefix="/projects/{project_id}/crawl", tags=["crawler"])


@router.post("/start", response_model=ApiResponse[dict], summary="Start PDF download crawl")
async def start_crawl(
    project_id: int,
    priority: Literal["high", "low"] = "low",
    max_papers: int = 50,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Start PDF download for papers that need PDFs."""

    stmt = (
        select(Paper)
        .where(Paper.project_id == project_id)
        .where(Paper.status.in_([PaperStatus.PENDING, PaperStatus.METADATA_ONLY]))
    )

    stmt = stmt.order_by(Paper.citation_count.desc() if priority == "high" else Paper.created_at.desc())

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


@router.get("/stats", response_model=ApiResponse[dict], summary="Get crawl statistics")
async def crawl_stats(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Return download statistics for the project."""

    stats = {}
    for status in PaperStatus:
        count = (
            await db.execute(select(func.count(Paper.id)).where(Paper.project_id == project_id, Paper.status == status))
        ).scalar() or 0
        stats[status.value] = count

    service = CrawlerService()
    storage = service.get_storage_stats()

    return ApiResponse(data={**stats, "storage": storage})
