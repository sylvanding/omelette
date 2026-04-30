"""AI library organization API endpoints."""

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Paper, Project
from app.schemas.common import ApiResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["library"])


class PaperIssue(BaseModel):
    """Metadata issue for a single paper."""

    paper_id: int
    title: str
    issues: list[str]
    issue_count: int


class LibraryHealthResponse(BaseModel):
    """Response from library health check."""

    total_papers: int
    papers_with_issues: int
    healthy_papers: int
    issues: list[PaperIssue]


class RepairedPaper(BaseModel):
    """Repaired paper metadata."""

    paper_id: int
    title: str
    abstract: str
    authors: list
    journal: str
    year: int | None
    citation_count: int
    doi: str


class RepairResponse(BaseModel):
    """Response from metadata repair."""

    repaired: list[RepairedPaper]
    failed: list[dict]
    total_attempted: int
    success_count: int
    failure_count: int


class TagSuggestion(BaseModel):
    """Tag suggestion for a single paper."""

    paper_id: int
    suggested_tags: list[str]


class AutoTagResponse(BaseModel):
    """Response from auto-tagging."""

    tags: list[TagSuggestion]
    total_tagged: int


class PaperCluster(BaseModel):
    """A thematic cluster of papers."""

    name: str
    description: str
    paper_ids: list[int]


class ClusterResponse(BaseModel):
    """Response from paper clustering."""

    clusters: list[PaperCluster]
    total_clusters: int


@router.get(
    "/health",
    response_model=ApiResponse[LibraryHealthResponse],
    summary="Check library metadata health",
)
async def check_health(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Scan all papers for missing metadata fields."""
    from app.services.library_service import LibraryService

    stmt = select(Paper).where(Paper.project_id == project_id)
    result = await db.execute(stmt)
    papers = result.scalars().all()

    papers_for_analysis = [
        {
            "paper_id": p.id,
            "title": p.title or "",
            "abstract": p.abstract or "",
            "authors": p.authors,
            "journal": p.journal or "",
            "year": p.year,
            "citation_count": p.citation_count,
            "doi": p.doi or "",
        }
        for p in papers
    ]

    svc = LibraryService(None)  # No LLM needed for health check
    health = svc.check_health(papers_for_analysis)

    return ApiResponse(
        data=LibraryHealthResponse(
            total_papers=health["total_papers"],
            papers_with_issues=health["papers_with_issues"],
            healthy_papers=health["healthy_papers"],
            issues=[PaperIssue(**issue) for issue in health["issues"]],
        )
    )


@router.post(
    "/repair",
    response_model=ApiResponse[RepairResponse],
    summary="Repair missing metadata via Semantic Scholar",
)
async def repair_metadata(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Attempt to fix missing metadata by querying Semantic Scholar."""
    from app.services.library_service import LibraryService

    stmt = select(Paper).where(Paper.project_id == project_id)
    result = await db.execute(stmt)
    papers = result.scalars().all()

    papers_for_repair = [
        p for p in papers if not p.abstract or not p.authors or not p.year or not p.journal or not p.doi
    ]

    if not papers_for_repair:
        return ApiResponse(
            data=RepairResponse(repaired=[], failed=[], total_attempted=0, success_count=0, failure_count=0)
        )

    papers_for_analysis = [
        {
            "paper_id": p.id,
            "title": p.title or "",
            "doi": p.doi or "",
        }
        for p in papers_for_repair
    ]

    svc = LibraryService(None)  # LLM not needed for repair
    repair_data = await svc.repair_metadata(papers_for_analysis)

    return ApiResponse(
        data=RepairResponse(
            repaired=[RepairedPaper(**p) for p in repair_data["repaired"]],
            failed=repair_data["failed"],
            total_attempted=repair_data["total_attempted"],
            success_count=repair_data["success_count"],
            failure_count=repair_data["failure_count"],
        )
    )


@router.post(
    "/auto-tag",
    response_model=ApiResponse[AutoTagResponse],
    summary="Suggest AI tags for papers",
)
async def auto_tag(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Suggest tags for all papers using LLM analysis."""
    from app.api.deps import get_llm
    from app.services.library_service import LibraryService

    stmt = select(Paper).where(Paper.project_id == project_id)
    result = await db.execute(stmt)
    papers = result.scalars().all()

    if not papers:
        return ApiResponse(data=AutoTagResponse(tags=[], total_tagged=0))

    papers_for_analysis = [
        {
            "paper_id": p.id,
            "title": p.title or "",
            "abstract": p.abstract or "",
        }
        for p in papers
    ]

    llm = get_llm()
    svc = LibraryService(llm)
    tag_data = await svc.suggest_tags(papers_for_analysis)

    return ApiResponse(
        data=AutoTagResponse(
            tags=[TagSuggestion(**t) for t in tag_data],
            total_tagged=len(tag_data),
        )
    )


@router.post(
    "/clusters",
    response_model=ApiResponse[ClusterResponse],
    summary="Cluster papers into thematic groups",
)
async def cluster_papers(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Group papers into thematic clusters using LLM analysis."""
    from app.api.deps import get_llm
    from app.services.library_service import LibraryService

    stmt = select(Paper).where(Paper.project_id == project_id)
    result = await db.execute(stmt)
    papers = result.scalars().all()

    if not papers:
        return ApiResponse(data=ClusterResponse(clusters=[], total_clusters=0))

    papers_for_analysis = [
        {
            "paper_id": p.id,
            "title": p.title or "",
            "abstract": p.abstract or "",
        }
        for p in papers
    ]

    llm = get_llm()
    svc = LibraryService(llm)
    cluster_data = await svc.cluster_papers(papers_for_analysis)

    return ApiResponse(
        data=ClusterResponse(
            clusters=[PaperCluster(**c) for c in cluster_data],
            total_clusters=len(cluster_data),
        )
    )
