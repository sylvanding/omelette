"""Paper CRUD and management API endpoints."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_or_404, get_project
from app.config import settings
from app.models import CollectionPaper, Paper, Project
from app.models.chunk import PaperChunk
from app.schemas.chunk import ChunkRead
from app.schemas.common import ApiResponse, PaginatedData, PaginationParams
from app.schemas.paper import PaperBatchDeleteRequest, PaperBulkImport, PaperCreate, PaperRead, PaperUpdate

router = APIRouter(tags=["papers"])


@router.get("", response_model=ApiResponse[PaginatedData[PaperRead]], summary="List papers with filters")
async def list_papers(
    project_id: int,
    pagination: PaginationParams = Depends(),
    status: str | None = None,
    reading_status: str | None = None,
    year: int | None = None,
    q: str | None = Query(default=None, description="Search title/abstract"),
    quality_tags: str | None = Query(default=None, description="Filter by quality tag"),
    collection_id: int | None = Query(default=None, description="Filter by collection"),
    sort_by: str = "created_at",
    order: str = "desc",
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    page, page_size = pagination.page, pagination.page_size
    base = select(Paper).where(Paper.project_id == project_id)
    count_base = select(func.count(Paper.id)).where(Paper.project_id == project_id)

    if collection_id:
        base = base.join(CollectionPaper, Paper.id == CollectionPaper.paper_id).where(
            CollectionPaper.collection_id == collection_id
        )
        count_base = count_base.join(CollectionPaper, Paper.id == CollectionPaper.paper_id).where(
            CollectionPaper.collection_id == collection_id
        )

    if status:
        base = base.where(Paper.status == status)
        count_base = count_base.where(Paper.status == status)
    if reading_status:
        base = base.where(Paper.reading_status == reading_status)
        count_base = count_base.where(Paper.reading_status == reading_status)
    if year:
        base = base.where(Paper.year == year)
        count_base = count_base.where(Paper.year == year)
    if q:
        like_q = f"%{q}%"
        base = base.where(Paper.title.ilike(like_q) | Paper.abstract.ilike(like_q))
        count_base = count_base.where(Paper.title.ilike(like_q) | Paper.abstract.ilike(like_q))
    if quality_tags:
        tags = [t.strip() for t in quality_tags.split(",") if t.strip()]
        if tags:
            base = base.where(Paper.quality_tags.overlap(tags))
            count_base = count_base.where(Paper.quality_tags.overlap(tags))

    total = (await db.execute(count_base)).scalar() or 0

    allowed_sort = {
        "id",
        "title",
        "year",
        "created_at",
        "updated_at",
        "citation_count",
        "source",
        "reading_status",
        "rating",
    }
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


@router.post("", response_model=ApiResponse[PaperRead], status_code=201, summary="Create paper")
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


@router.post("/bulk", response_model=ApiResponse[dict], summary="Bulk import papers")
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


@router.post("/batch-delete", response_model=ApiResponse[dict], summary="Batch delete papers")
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


@router.post("/batch-update", response_model=ApiResponse[dict], summary="Batch update papers")
async def batch_update_papers(
    project_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Update tags and/or reading_status for multiple papers at once."""
    paper_ids = body.get("paper_ids", [])
    updates = body.get("updates", {})

    if not paper_ids:
        raise HTTPException(status_code=400, detail="paper_ids is required")
    if not updates:
        raise HTTPException(status_code=400, detail="updates is required")

    allowed_fields = {"tags", "reading_status", "quality_tags", "rating"}
    invalid = set(updates.keys()) - allowed_fields
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid update fields: {invalid}")

    stmt = select(Paper).where(
        Paper.project_id == project_id,
        Paper.id.in_(paper_ids),
    )
    result = await db.execute(stmt)
    papers = result.scalars().all()

    updated = 0
    for paper in papers:
        for field, value in updates.items():
            setattr(paper, field, value)
        updated += 1

    await db.flush()
    return ApiResponse(data={"updated": updated, "total": len(paper_ids)})


@router.post("/reading-sessions", response_model=ApiResponse[dict], status_code=201, summary="Record a reading session")
async def record_reading_session(
    project_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Record a reading session for a paper."""
    from datetime import datetime

    from app.models.reading_session import ReadingSession

    paper_id = body.get("paper_id")
    started_at = body.get("started_at")
    ended_at = body.get("ended_at")
    time_spent_seconds = body.get("time_spent_seconds")
    pages_read = body.get("pages_read")

    if not all([paper_id, started_at, ended_at, time_spent_seconds is not None]):
        raise HTTPException(
            status_code=400, detail="paper_id, started_at, ended_at, and time_spent_seconds are required"
        )

    if time_spent_seconds < 0:
        raise HTTPException(status_code=400, detail="time_spent_seconds must be non-negative")

    paper = await get_or_404(db, Paper, paper_id, detail="Paper not found")
    if paper.project_id != project_id:
        raise HTTPException(status_code=404, detail="Paper not found in this project")

    if isinstance(started_at, str):
        started_at = datetime.fromisoformat(started_at)
    if isinstance(ended_at, str):
        ended_at = datetime.fromisoformat(ended_at)

    session = ReadingSession(
        paper_id=paper_id,
        started_at=started_at,
        ended_at=ended_at,
        time_spent_seconds=time_spent_seconds,
        pages_read=pages_read,
    )
    db.add(session)

    if paper.reading_status == "unread":
        paper.reading_status = "reading"
    if not paper.read_at:
        paper.read_at = datetime.now()

    await db.commit()
    await db.refresh(session)

    return ApiResponse(
        data={
            "id": session.id,
            "paper_id": session.paper_id,
            "started_at": session.started_at.isoformat(),
            "ended_at": session.ended_at.isoformat(),
            "time_spent_seconds": session.time_spent_seconds,
            "pages_read": session.pages_read,
            "created_at": session.created_at.isoformat() if session.created_at else None,
        }
    )


@router.get("/reading-sessions", response_model=ApiResponse[dict], summary="List reading sessions")
async def list_reading_sessions(
    project_id: int,
    paper_id: int | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """List reading sessions for a project, optionally filtered by paper."""
    from app.models.reading_session import ReadingSession

    query = (
        select(ReadingSession)
        .join(Paper)
        .where(Paper.project_id == project_id)
        .options(selectinload(ReadingSession.paper))
    )
    if paper_id:
        query = query.where(ReadingSession.paper_id == paper_id)

    total_stmt = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(total_stmt)
    total = total_result.scalar() or 0

    query = query.order_by(ReadingSession.started_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    sessions = result.scalars().all()

    items = [
        {
            "id": s.id,
            "paper_id": s.paper_id,
            "paper_title": s.paper.title or "Untitled",
            "started_at": s.started_at.isoformat(),
            "ended_at": s.ended_at.isoformat(),
            "time_spent_seconds": s.time_spent_seconds,
            "pages_read": s.pages_read,
        }
        for s in sessions
    ]

    return ApiResponse(
        data={
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size if page_size else 0,
        }
    )


@router.get("/analytics", response_model=ApiResponse[dict], summary="Get reading analytics")
async def get_reading_analytics(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Return aggregated reading analytics for all papers in the project."""
    from app.services.analytics_service import AnalyticsService

    svc = AnalyticsService(db)

    base = select(Paper).where(Paper.project_id == project_id)
    papers = (await db.execute(base)).scalars().all()

    total = len(papers)
    status_counts: dict[str, int] = {"unread": 0, "reading": 0, "read": 0, "archived": 0}
    for p in papers:
        status_counts[p.reading_status] = status_counts.get(p.reading_status, 0) + 1

    read_papers = [p for p in papers if p.reading_status == "read" and p.read_at]
    read_by_week: dict[str, int] = {}
    for p in read_papers:
        week = p.read_at.strftime("%Y-%W") if p.read_at else "unknown"
        read_by_week[week] = read_by_week.get(week, 0) + 1

    read_by_day: dict[str, int] = {}
    for p in read_papers:
        day = p.read_at.strftime("%Y-%m-%d") if p.read_at else "unknown"
        read_by_day[day] = read_by_day.get(day, 0) + 1

    journal_counts: dict[str, int] = {}
    for p in papers:
        if p.journal:
            journal_counts[p.journal] = journal_counts.get(p.journal, 0) + 1
    top_journals = sorted(journal_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    papers_per_week = await svc.compute_papers_per_week(project_id)
    avg_read_time = await svc.compute_avg_read_time(project_id)
    reading_streak = await svc.compute_reading_streak(project_id)
    domain_coverage = await svc.compute_domain_coverage(project_id)
    citation_impact = await svc.compute_citation_impact(project_id)

    return ApiResponse(
        data={
            "total": total,
            "by_status": status_counts,
            "read_by_week": dict(sorted(read_by_week.items())),
            "read_by_day": dict(sorted(read_by_day.items())),
            "top_journals": [{"journal": j, "count": c} for j, c in top_journals],
            "papers_per_week": papers_per_week,
            "avg_read_time_seconds": avg_read_time,
            "reading_streak_days": reading_streak,
            "domain_coverage": domain_coverage,
            "citation_impact": citation_impact,
        }
    )


@router.get("/{paper_id}", response_model=ApiResponse[PaperRead], summary="Get paper by ID")
async def get_paper(
    project_id: int,
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    paper = await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")
    return ApiResponse(data=PaperRead.model_validate(paper))


@router.put("/{paper_id}", response_model=ApiResponse[PaperRead], summary="Update paper")
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


@router.delete("/{paper_id}", response_model=ApiResponse, summary="Delete paper")
async def delete_paper(
    project_id: int,
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    paper = await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")
    await db.delete(paper)
    return ApiResponse(message="Paper deleted")


@router.get("/{paper_id}/pdf", summary="Serve PDF file")
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


@router.get("/{paper_id}/chunks", response_model=ApiResponse[PaginatedData[ChunkRead]], summary="List paper chunks")
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


@router.get("/{paper_id}/citation-graph", response_model=ApiResponse, summary="Get citation graph")
async def get_citation_graph(
    project_id: int,
    paper_id: int,
    depth: int = Query(1, ge=1, le=2),
    max_nodes: int = Query(50, ge=10, le=200),
    mode: str = Query("all", pattern="^(all|prior|derivative|similarity)$"),
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Get citation relationship graph for a paper via Semantic Scholar.

    Modes: all (default), prior (references), derivative (citations), similarity (embeddings).
    """
    from app.services.citation_graph_service import CitationGraphService

    svc = CitationGraphService(db)
    graph = await svc.get_citation_graph(
        paper_id,
        project_id,
        depth=depth,
        max_nodes=max_nodes,
        mode=mode,  # type: ignore[arg-type]
    )
    return ApiResponse(data=graph)


@router.post("/export", summary="Export papers as bibliography format")
async def export_papers(
    project_id: int,
    format: str = Query(default="bibtex", description="Export format: bibtex, ris, or endnote"),
    status: str | None = Query(default=None),
    year: int | None = Query(default=None),
    q: str | None = Query(default=None, description="Search title/abstract"),
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Export papers in bibliography format, respecting the same filters as the list endpoint."""
    from app.services.export_service import FORMAT_EXTENSIONS, FORMAT_MIME_TYPES, generate_export

    if format not in ("bibtex", "ris", "endnote"):
        raise HTTPException(status_code=400, detail="Format must be bibtex, ris, or endnote")

    base = select(Paper).where(Paper.project_id == project_id)
    if status:
        base = base.where(Paper.status == status)
    if year:
        base = base.where(Paper.year == year)
    if q:
        like_q = f"%{q}%"
        base = base.where(Paper.title.ilike(like_q) | Paper.abstract.ilike(like_q))

    papers = (await db.execute(base.order_by(Paper.year.desc()))).scalars().all()
    content = generate_export(papers, format)
    ext = FORMAT_EXTENSIONS[format]
    filename = f"{project.name.replace(' ', '-').lower()}-{format}.{ext}"

    return Response(
        content=content,
        media_type=FORMAT_MIME_TYPES[format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/compare", response_model=ApiResponse[dict], summary="Compare selected papers")
async def compare_papers(
    project_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Generate an AI-powered comparison of 2-5 selected papers."""
    from app.services.comparison_service import ComparisonService
    from app.services.llm.client import get_llm_client

    paper_ids = body.get("paper_ids", [])
    if not isinstance(paper_ids, list) or len(paper_ids) < 2:
        raise HTTPException(status_code=400, detail="Select 2-5 papers to compare")
    if len(paper_ids) > 5:
        raise HTTPException(status_code=400, detail="Cannot compare more than 5 papers")

    focus = body.get("focus")

    llm = get_llm_client()
    svc = ComparisonService(db, llm)
    result = await svc.compare_papers(paper_ids, focus=focus)
    return ApiResponse(data=result)


@router.get("/{paper_id}/similar", response_model=ApiResponse[list[dict]], summary="Get similar papers")
async def get_similar_papers(
    project_id: int,
    paper_id: int,
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Return papers semantically similar to the given paper using ChromaDB embeddings."""
    import asyncio
    import logging
    import statistics

    import numpy as np

    from app.services.rag_service import RAGService

    logger = logging.getLogger(__name__)

    _section_weights: dict[str, float] = {
        "abstract": 3.0,
        "introduction": 2.0,
        "intro": 2.0,
        "conclusion": 2.5,
        "methods": 1.0,
        "methodology": 1.0,
        "results": 1.5,
        "discussion": 2.0,
        "references": 0.0,
    }

    await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")

    rag_service = RAGService()
    collection = rag_service._get_collection(project_id)

    try:
        chunk_result = await asyncio.to_thread(
            collection.get,
            where={"paper_id": paper_id},
            include=["embeddings", "metadatas"],
        )
    except Exception as e:
        logger.warning("Failed to fetch embeddings for paper %d: %s", paper_id, e)
        return ApiResponse(data=[])

    chunk_embeddings = chunk_result.get("embeddings")
    chunk_metadatas = chunk_result.get("metadatas", [])
    if not chunk_embeddings:
        return ApiResponse(data=[])

    # Weighted paper vector: important sections contribute more
    def _chunk_weight(meta: dict) -> float:
        section = (meta.get("section") or "").lower().strip()
        return _section_weights.get(section, 1.0)

    weights = [_chunk_weight(m) for m in chunk_metadatas]
    if sum(weights) == 0:
        paper_vector = np.mean(chunk_embeddings, axis=0).tolist()
    else:
        paper_vector = np.average(chunk_embeddings, axis=0, weights=weights).tolist()

    query_result = await asyncio.to_thread(
        collection.query,
        query_embeddings=[paper_vector],
        n_results=limit + 1,
        where={"paper_id": {"$ne": paper_id}},
        include=["metadatas", "distances"],
    )

    metadatas = query_result.get("metadatas", [[]])[0]
    distances = query_result.get("distances", [[]])[0]

    paper_scores: dict[int, list[float]] = {}
    for meta, dist in zip(metadatas, distances):
        pid = meta.get("paper_id")
        if pid is None:
            continue
        # Skip zero-weight sections (e.g. references) from candidate scoring
        section = (meta.get("section") or "").lower().strip()
        if _section_weights.get(section, 1.0) == 0:
            continue
        if pid not in paper_scores:
            paper_scores[pid] = []
        paper_scores[pid].append(dist)

    aggregated = []
    for pid, dists in paper_scores.items():
        median_dist = statistics.median(dists)
        similarity = round(max(0, (1 - median_dist) * 100), 1)
        aggregated.append((pid, similarity))

    aggregated.sort(key=lambda x: x[1], reverse=True)
    top_paper_ids = [pid for pid, _ in aggregated[:limit]]

    if not top_paper_ids:
        return ApiResponse(data=[])

    stmt = select(Paper).where(Paper.id.in_(top_paper_ids))
    result = await db.execute(stmt)
    papers_map = {p.id: p for p in result.scalars().all()}

    similar_papers = []
    for pid, score in aggregated[:limit]:
        p = papers_map.get(pid)
        if p is None:
            continue
        authors = p.authors or []
        author_names = [a.get("name", "") for a in authors if isinstance(a, dict)]
        similar_papers.append(
            {
                "id": p.id,
                "title": p.title,
                "authors": author_names[:3],
                "year": p.year,
                "journal": p.journal,
                "citation_count": p.citation_count,
                "similarity_score": score,
            }
        )

    return ApiResponse(data=similar_papers)


@router.post("/{paper_id}/highlights", response_model=ApiResponse[dict], summary="Generate skimming highlights")
async def generate_highlights(
    project_id: int,
    paper_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Generate Goal/Method/Result skimming highlights for a paper."""
    from app.api.deps import get_llm
    from app.services.augmented_reading_service import AugmentedReadingService

    paper = await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")

    paper_content = f"Title: {paper.title or ''}\nAbstract: {paper.abstract or ''}"
    if paper.notes:
        paper_content += f"\n\nNotes: {paper.notes}"

    llm = get_llm()
    svc = AugmentedReadingService(llm)
    highlights = await svc.generate_highlights(paper_content)
    return ApiResponse(data={"highlights": highlights})


@router.get(
    "/{paper_id}/citation-cards", response_model=ApiResponse[dict], summary="Get citation cards for project papers"
)
async def get_citation_cards(
    project_id: int,
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Generate TLDR citation cards for papers in the project."""
    from app.api.deps import get_llm
    from app.services.augmented_reading_service import AugmentedReadingService

    await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")

    # Get other papers in the project for citation cards
    stmt = select(Paper).where(Paper.project_id == project_id, Paper.id != paper_id).limit(10)
    result = await db.execute(stmt)
    other_papers = result.scalars().all()

    paper_dicts = [{"paper_id": p.id, "title": p.title, "abstract": p.abstract, "doi": p.doi} for p in other_papers]

    llm = get_llm()
    svc = AugmentedReadingService(llm)
    cards = await svc.generate_citation_cards(paper_dicts)
    return ApiResponse(data={"cards": cards})


@router.get("/{paper_id}/definitions", response_model=ApiResponse[dict], summary="Get term definitions from paper")
async def get_definitions(
    project_id: int,
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Extract and define key technical terms from a paper."""
    from app.api.deps import get_llm
    from app.services.augmented_reading_service import AugmentedReadingService

    paper = await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")

    paper_content = f"Title: {paper.title or ''}\nAbstract: {paper.abstract or ''}"
    if paper.notes:
        paper_content += f"\n\nNotes: {paper.notes}"

    llm = get_llm()
    svc = AugmentedReadingService(llm)
    definitions = await svc.generate_definitions(paper_content)
    return ApiResponse(data={"definitions": definitions})


@router.get(
    "/{paper_id}/versions",
    response_model=ApiResponse[dict],
    summary="Get version history for a paper",
)
async def get_paper_versions(
    project_id: int,
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Return the version history tracking preprint-to-journal lineage."""
    from app.services.version_service import VersionService

    await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")

    svc = VersionService(db)
    versions = await svc.get_version_history(paper_id)

    return ApiResponse(data={"versions": versions, "total": len(versions)})


@router.post(
    "/{paper_id}/versions/check",
    response_model=ApiResponse[dict],
    summary="Check for newer versions of a paper",
)
async def check_paper_versions(
    project_id: int,
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Poll Semantic Scholar for newer versions of a paper and record if found."""
    from app.services.version_service import VersionService

    paper = await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")
    if not paper.doi:
        return ApiResponse(data={"update_found": False, "reason": "Paper has no DOI"})

    svc = VersionService(db)
    version_info = await svc.check_for_updates(paper_id)

    if not version_info:
        return ApiResponse(data={"update_found": False})

    version_info["source"] = "manual_check"
    entry = await svc.record_version(paper_id, version_info, previous_doi=paper.doi)

    return ApiResponse(data={"update_found": True, "version": entry})


@router.post(
    "/{paper_id}/versions/{version_id}/upgrade",
    response_model=ApiResponse[dict],
    summary="Upgrade paper to a newer version",
)
async def upgrade_paper_version(
    project_id: int,
    paper_id: int,
    version_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Upgrade a paper to a newer version, preserving annotations and user data."""
    from app.services.version_service import VersionService

    await get_or_404(db, Paper, paper_id, project_id=project_id, detail="Paper not found")

    svc = VersionService(db)
    try:
        result = await svc.upgrade_to_version(paper_id, version_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    return ApiResponse(data=result)


class NoteEntry(BaseModel):
    """Aggregated note entry for a single paper."""

    paper_id: int
    title: str
    authors: list
    year: int | None
    journal: str | None
    notes: str
    reading_status: str
    updated_at: str | None


class NotesAggregationResponse(BaseModel):
    """Aggregated notes response for a project."""

    total_papers: int
    papers_with_notes: int
    total_notes: int
    notes: list[NoteEntry]


@router.get(
    "/notes/aggregate",
    response_model=ApiResponse[NotesAggregationResponse],
    summary="Aggregated notes across all papers in a project",
)
async def aggregate_notes(
    project_id: int,
    search: str | None = Query(default=None, description="Search across note content"),
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Return aggregated notes from all papers in the project, optionally filtered by search."""
    # Count total papers
    total_stmt = select(func.count(Paper.id)).where(Paper.project_id == project_id)
    total_result = await db.execute(total_stmt)
    total_papers = total_result.scalar() or 0

    # Build query for papers with notes

    stmt = (
        select(Paper)
        .where(Paper.project_id == project_id)
        .where(Paper.notes.isnot(None))
        .where(Paper.notes != "")
        .order_by(Paper.updated_at.desc())
    )
    if search:
        stmt = stmt.where(Paper.notes.ilike(f"%{search}%"))

    result = await db.execute(stmt)
    papers = result.scalars().all()

    notes_list = []
    total_notes_chars = 0
    for p in papers:
        authors = p.authors or []
        notes_list.append(
            NoteEntry(
                paper_id=p.id,
                title=p.title or "",
                authors=authors,
                year=p.year,
                journal=p.journal,
                notes=p.notes or "",
                reading_status=p.reading_status,
                updated_at=p.updated_at.isoformat() if p.updated_at else None,
            )
        )
        total_notes_chars += len(p.notes or "")

    return ApiResponse(
        code=0,
        message="Notes aggregated successfully",
        data=NotesAggregationResponse(
            total_papers=total_papers,
            papers_with_notes=len(notes_list),
            total_notes=total_notes_chars,
            notes=notes_list,
        ),
    )
