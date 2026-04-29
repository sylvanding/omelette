"""Paper CRUD and management API endpoints."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
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


@router.get("", response_model=ApiResponse[PaginatedData[PaperRead]], summary="List papers with filters")
async def list_papers(
    project_id: int,
    pagination: PaginationParams = Depends(),
    status: str | None = None,
    reading_status: str | None = None,
    year: int | None = None,
    q: str | None = Query(default=None, description="Search title/abstract"),
    quality_tags: str | None = Query(default=None, description="Filter by quality tag"),
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


@router.get("/analytics", response_model=ApiResponse[dict], summary="Get reading analytics")
async def get_reading_analytics(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Return aggregated reading analytics for all papers in the project."""
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

    journal_counts: dict[str, int] = {}
    for p in papers:
        if p.journal:
            journal_counts[p.journal] = journal_counts.get(p.journal, 0) + 1
    top_journals = sorted(journal_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    return ApiResponse(
        data={
            "total": total,
            "by_status": status_counts,
            "read_by_week": dict(sorted(read_by_week.items())),
            "top_journals": [{"journal": j, "count": c} for j, c in top_journals],
        }
    )


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
