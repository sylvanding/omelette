"""Literature search API endpoints — multi-source federated search."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.models import Keyword, Paper, Project
from app.schemas.common import ApiResponse
from app.services.search_service import SearchService

router = APIRouter(prefix="/projects/{project_id}/search", tags=["search"])


@router.post("/execute", response_model=ApiResponse[dict])
async def execute_search(
    project_id: int,
    query: str = "",
    sources: list[str] | None = None,
    max_results: int = 100,
    auto_import: bool = False,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Execute federated search. If auto_import=True, import results to project."""

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
    results = await service.search(query, sources, max_results)

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


@router.get("/sources", response_model=ApiResponse[list[dict]])
async def list_search_sources():
    """Return available search sources and their status."""
    return ApiResponse(
        data=[
            {"id": "semantic_scholar", "name": "Semantic Scholar", "status": "available", "api": True},
            {"id": "openalex", "name": "OpenAlex", "status": "available", "api": True},
            {"id": "arxiv", "name": "arXiv", "status": "available", "api": True},
            {"id": "crossref", "name": "Crossref", "status": "available", "api": True},
        ]
    )
