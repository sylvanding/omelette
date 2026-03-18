"""Literature search API endpoints — multi-source federated search."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.middleware.rate_limit import limiter
from app.models import Keyword, Paper, Project
from app.schemas.common import ApiResponse
from app.services.search_service import SearchService

router = APIRouter(prefix="/projects/{project_id}/search", tags=["search"])


class SearchExecuteRequest(BaseModel):
    """Request body for federated search execution."""

    query: str = Field(default="", description="Search query; if empty, built from project keywords")
    sources: list[str] | None = Field(default=None, description="Search sources to use")
    max_results: int = Field(default=100, ge=1, le=500, description="Maximum results per source")
    auto_import: bool = Field(default=False, description="Import results into project")


@router.post("/execute", response_model=ApiResponse[dict], summary="Execute federated search")
@limiter.limit("10/minute")
async def execute_search(
    request: Request,
    project_id: int,
    body: SearchExecuteRequest,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Execute federated search. If auto_import=True, import results to project."""
    query = body.query
    sources = body.sources
    max_results = body.max_results
    auto_import = body.auto_import

    # If no query, build from project keywords
    if not query:
        stmt = select(Keyword).where(Keyword.project_id == project_id, Keyword.level == 1)
        result = await db.execute(stmt)
        keywords = result.scalars().all()
        query = " OR ".join(kw.term_en or kw.term for kw in keywords)

    if not query:
        raise HTTPException(
            status_code=400,
            detail="No query provided and no keywords configured",
        )

    service = SearchService()
    results = await service.search(query, sources=sources, max_results=max_results)

    # Optionally auto-import results
    if auto_import and results["papers"]:
        imported = 0
        for paper_data in results["papers"]:
            if not paper_data.get("title"):
                continue
            if paper_data.get("doi"):
                existing = (
                    await db.execute(
                        select(Paper).where(
                            Paper.project_id == project_id,
                            Paper.doi == paper_data["doi"],
                        )
                    )
                ).scalar_one_or_none()
                if existing:
                    continue
            paper = Paper(
                project_id=project_id,
                doi=paper_data.get("doi", ""),
                title=paper_data["title"],
                abstract=paper_data.get("abstract", ""),
                authors=paper_data.get("authors"),
                journal=paper_data.get("journal", ""),
                year=paper_data.get("year"),
                citation_count=paper_data.get("citation_count", 0),
                source=paper_data.get("source", ""),
                source_id=paper_data.get("source_id", ""),
                pdf_url=paper_data.get("pdf_url", ""),
                status="metadata_only",
            )
            db.add(paper)
            imported += 1
        await db.flush()
        results["imported"] = imported

    return ApiResponse(data=results)


@router.get("/sources", response_model=ApiResponse[list[dict]], summary="List search sources")
async def list_search_sources(project: Project = Depends(get_project)):
    """Return available search sources and their status."""
    return ApiResponse(
        data=[
            {"id": "semantic_scholar", "name": "Semantic Scholar", "status": "available", "api": True},
            {"id": "openalex", "name": "OpenAlex", "status": "available", "api": True},
            {"id": "arxiv", "name": "arXiv", "status": "available", "api": True},
            {"id": "crossref", "name": "Crossref", "status": "available", "api": True},
        ]
    )
