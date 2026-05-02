"""Literature search API endpoints — multi-source federated search."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.database import async_session_factory
from app.middleware.rate_limit import limiter
from app.models import Keyword, Paper, Project, Task, TaskStatus, TaskType
from app.schemas.common import ApiResponse
from app.services.search_service import SearchService

logger = logging.getLogger(__name__)

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
        # Batch check existing DOIs in a single query
        all_dois = {p["doi"] for p in results["papers"] if p.get("doi")}
        existing_dois: set[str] = set()
        if all_dois:
            rows = await db.execute(
                select(Paper.doi).where(
                    Paper.project_id == project_id,
                    Paper.doi.in_(all_dois),
                )
            )
            existing_dois = {row[0] for row in rows}

        imported = 0
        for paper_data in results["papers"]:
            if not paper_data.get("title"):
                continue
            if paper_data.get("doi") and paper_data["doi"] in existing_dois:
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


class SearchExecuteAsyncRequest(BaseModel):
    """Request body for async federated search execution."""

    query: str = Field(default="", description="Search query; if empty, built from project keywords")
    sources: list[str] | None = Field(default=None, description="Search sources to use")
    max_results: int = Field(default=100, ge=1, le=500, description="Maximum results per source")
    auto_import: bool = Field(default=False, description="Import results into project")


@router.post("/execute-async", response_model=ApiResponse[dict], summary="Execute async federated search")
@limiter.limit("10/minute")
async def execute_search_async(
    request: Request,
    project_id: int,
    body: SearchExecuteAsyncRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Start an async federated search. Returns a task_id for progress polling."""
    task = Task(
        project_id=project_id,
        task_type=TaskType.SEARCH,
        status=TaskStatus.PENDING,
        params={
            "query": body.query,
            "sources": body.sources,
            "max_results": body.max_results,
            "auto_import": body.auto_import,
        },
        progress=0,
        total=len(body.sources or ["semantic_scholar", "openalex", "arxiv", "crossref"]),
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    background_tasks.add_task(
        _run_search_task,
        task_id=task.id,
        project_id=project_id,
        query=body.query,
        sources=body.sources,
        max_results=body.max_results,
        auto_import=body.auto_import,
    )

    return ApiResponse(data={"task_id": task.id, "status": task.status})


async def _run_search_task(
    task_id: int,
    project_id: int,
    query: str,
    sources: list[str] | None,
    max_results: int,
    auto_import: bool,
):
    """Background task that executes the search and updates task progress."""
    async with async_session_factory() as task_db:
        task = await task_db.get(Task, task_id)
        if not task:
            return
        task.status = TaskStatus.RUNNING
        task.started_at = datetime.now(UTC)
        await task_db.flush()

        try:
            # Build query from keywords if empty
            if not query:
                stmt = select(Keyword).where(Keyword.project_id == project_id, Keyword.level == 1)
                result = await task_db.execute(stmt)
                keywords = result.scalars().all()
                query = " OR ".join(kw.term_en or kw.term for kw in keywords)

            if not query:
                task.status = TaskStatus.FAILED
                task.error_message = "No query provided and no keywords configured"
                await task_db.commit()
                return

            # Execute search with progress per source
            service = SearchService()
            if sources is None:
                sources = list(service.providers.keys())

            task.total = len(sources)
            all_papers = []
            source_stats = {}
            completed = 0

            for source in sources:
                if source not in service.providers:
                    continue
                try:
                    papers = await service.providers[source].search(query, max_results)
                    source_stats[source] = {"count": len(papers)}
                    all_papers.extend([p.to_dict() for p in papers])
                except Exception as e:
                    source_stats[source] = {"count": 0, "error": str(e)}
                    logger.error("Search failed for %s: %s", source, e)

                completed += 1
                task.progress = completed
                await task_db.flush()

            # Deduplicate across sources
            deduped = service._dedup_results(all_papers)

            # Optionally import results
            imported = 0
            if auto_import and deduped:
                all_dois = {p["doi"] for p in deduped if p.get("doi")}
                existing_dois: set[str] = set()
                if all_dois:
                    rows = await task_db.execute(
                        select(Paper.doi).where(
                            Paper.project_id == project_id,
                            Paper.doi.in_(all_dois),
                        )
                    )
                    existing_dois = {row[0] for row in rows}

                for paper_data in deduped:
                    if not paper_data.get("title"):
                        continue
                    if paper_data.get("doi") and paper_data["doi"] in existing_dois:
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
                    task_db.add(paper)
                    imported += 1
                await task_db.flush()

            task.status = TaskStatus.COMPLETED
            task.progress = task.total
            task.result = {
                "papers": deduped,
                "total": len(deduped),
                "source_stats": source_stats,
                "imported": imported,
            }
            task.completed_at = datetime.now(UTC)
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error_message = str(e)
            logger.error("Search task %d failed: %s", task_id, e)
        await task_db.commit()


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
