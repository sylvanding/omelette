"""Pipeline node implementations — each node wraps an existing service."""

from __future__ import annotations

import logging
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from app.pipelines.state import PipelineState

logger = logging.getLogger(__name__)


def _is_cancelled(state: PipelineState) -> bool:
    """Check if pipeline has been cancelled via the API."""
    from app.pipelines.cancellation import is_cancelled

    thread_id = state.get("thread_id", "")
    return is_cancelled(thread_id) or state.get("cancelled", False)


async def search_node(state: PipelineState) -> dict[str, Any]:
    """Run multi-source federated search."""
    if _is_cancelled(state):
        return {"stage": "cancelled", "cancelled": True}

    from app.services.search_service import SearchService

    params = state.get("params", {})
    query = params.get("query", params.get("keywords", ""))
    sources = params.get("sources")
    max_results = params.get("max_results", 50)

    svc = SearchService()
    results = await svc.search(query=query, sources=sources, max_results=max_results)
    papers = results.get("papers", [])

    return {
        "papers": papers,
        "stage": "search",
        "progress": 20,
    }


async def extract_metadata_node(state: PipelineState) -> dict[str, Any]:
    """Extract metadata from uploaded PDF files."""
    if _is_cancelled(state):
        return {"stage": "cancelled", "cancelled": True}

    from app.services.pdf_metadata import extract_metadata

    params = state.get("params", {})
    pdf_paths = params.get("pdf_paths", [])
    papers: list[dict] = []

    for path_str in pdf_paths:
        path = Path(path_str)
        if not path.exists():
            logger.warning("PDF not found: %s", path_str)
            continue
        meta = await extract_metadata(path, fallback_title=path.stem)
        papers.append(meta.model_dump())

    return {
        "papers": papers,
        "stage": "extract",
        "progress": 20,
    }


async def dedup_node(state: PipelineState) -> dict[str, Any]:
    """Check for duplicates against existing papers in the knowledge base."""
    if _is_cancelled(state):
        return {"stage": "cancelled", "cancelled": True}

    from sqlalchemy import select

    from app.config import settings
    from app.database import async_session_factory
    from app.models import Paper
    from app.services.dedup_service import DedupService

    project_id = state["project_id"]
    new_papers = state.get("papers", [])
    if not new_papers:
        return {"papers": [], "conflicts": [], "stage": "dedup", "progress": 40}

    title_threshold = settings.dedup_title_hard_threshold
    conflicts: list[dict] = []
    clean_papers: list[dict] = []

    async with async_session_factory() as db:
        existing = (await db.execute(select(Paper).where(Paper.project_id == project_id))).scalars().all()

        existing_dois = {p.doi for p in existing if p.doi}
        existing_titles = [(p.id, DedupService.normalize_title(p.title)) for p in existing if p.title]

        for np in new_papers:
            new_doi = np.get("doi", "")
            new_title = np.get("title", "")
            conflict_found = False

            if new_doi and new_doi in existing_dois:
                match = next((p for p in existing if p.doi == new_doi), None)
                if match:
                    conflicts.append(
                        {
                            "conflict_id": f"{match.id}:{new_title[:30]}",
                            "old_paper_id": match.id,
                            "old_title": match.title,
                            "new_paper": np,
                            "reason": "doi_duplicate",
                            "similarity": 1.0,
                        }
                    )
                    conflict_found = True

            if not conflict_found and new_title:
                norm_new = DedupService.normalize_title(new_title)
                for eid, enorm in existing_titles:
                    if not norm_new or not enorm:
                        continue
                    sim = SequenceMatcher(None, norm_new, enorm).ratio()
                    if sim >= title_threshold:
                        match = next((p for p in existing if p.id == eid), None)
                        if match:
                            conflicts.append(
                                {
                                    "conflict_id": f"{eid}:{new_title[:30]}",
                                    "old_paper_id": eid,
                                    "old_title": match.title,
                                    "new_paper": np,
                                    "reason": "title_similarity",
                                    "similarity": round(sim, 3),
                                }
                            )
                            conflict_found = True
                            break

            if not conflict_found:
                clean_papers.append(np)

    return {
        "papers": clean_papers,
        "conflicts": conflicts,
        "stage": "dedup",
        "progress": 40,
    }


async def hitl_dedup_node(state: PipelineState) -> dict[str, Any]:
    """HITL node: interrupt if conflicts exist, otherwise pass through."""
    conflicts = state.get("conflicts", [])
    if conflicts:
        from langgraph.types import interrupt

        resolved = interrupt({"conflicts": conflicts, "message": "Dedup conflicts found. Resolve to continue."})
        return {
            "resolved_conflicts": resolved if isinstance(resolved, list) else [],
            "conflicts": [],
            "stage": "dedup_resolved",
        }
    return {"stage": "dedup_resolved"}


async def apply_resolution_node(state: PipelineState) -> dict[str, Any]:
    """Apply conflict resolutions and merge clean papers for import."""
    if _is_cancelled(state):
        return {"stage": "cancelled", "cancelled": True}

    resolved = state.get("resolved_conflicts", [])
    clean_papers = list(state.get("papers", []))

    for res in resolved:
        action = res.get("action", "skip")
        new_paper = res.get("new_paper") or {}
        merged_paper = res.get("merged_paper") or {}
        if action == "keep_new" and new_paper:
            clean_papers.append(new_paper)
        elif action == "merge" and merged_paper:
            clean_papers.append(merged_paper)

    return {"papers": clean_papers, "stage": "resolved"}


async def import_node(state: PipelineState) -> dict[str, Any]:
    """Import clean papers into the database."""
    if _is_cancelled(state):
        return {"stage": "cancelled", "cancelled": True}

    from app.database import async_session_factory
    from app.models import Paper

    project_id = state["project_id"]
    papers = state.get("papers", [])
    imported = 0

    async with async_session_factory() as db:
        for p in papers:
            paper = Paper(
                project_id=project_id,
                title=p.get("title", "Untitled"),
                abstract=p.get("abstract", ""),
                doi=p.get("doi"),
                authors=p.get("authors"),
                year=p.get("year"),
                journal=p.get("journal", ""),
                pdf_url=p.get("pdf_url", ""),
                pdf_path=p.get("pdf_path", ""),
                source=p.get("source", "pipeline"),
            )
            db.add(paper)
            imported += 1
        await db.commit()

    return {"progress": 50, "stage": "imported", "result": {"imported": imported}}


async def crawl_node(state: PipelineState) -> dict[str, Any]:
    """Download PDFs for papers that have pdf_url but no pdf_path."""
    if _is_cancelled(state):
        return {"stage": "cancelled", "cancelled": True}

    from sqlalchemy import select

    from app.database import async_session_factory
    from app.models import Paper, PaperStatus
    from app.services.crawler_service import CrawlerService

    project_id = state["project_id"]
    downloaded = 0
    failed = 0

    async with async_session_factory() as db:
        stmt = select(Paper).where(
            Paper.project_id == project_id,
            Paper.status.in_([PaperStatus.PENDING, PaperStatus.METADATA_ONLY]),
            Paper.pdf_url != "",
        )
        papers = (await db.execute(stmt)).scalars().all()
        crawler = CrawlerService()

        for paper in papers:
            if state.get("cancelled"):
                break
            try:
                result = await crawler.download_paper(paper)
                if result.get("success"):
                    paper.pdf_path = result.get("path", "")
                    paper.status = PaperStatus.PDF_DOWNLOADED
                    downloaded += 1
                else:
                    failed += 1
            except Exception as e:
                logger.warning("Download failed for paper %d: %s", paper.id, e)
                failed += 1
        await db.commit()

    return {
        "progress": 65,
        "stage": "crawl",
        "result": {"downloaded": downloaded, "failed": failed},
    }


async def ocr_node(state: PipelineState) -> dict[str, Any]:
    """Run OCR on downloaded PDFs and create text chunks.

    Uses MinerU (if available) for deep parsing with formula/table/figure
    recognition, falling back to pdfplumber + PaddleOCR.
    """
    if _is_cancelled(state):
        return {"stage": "cancelled", "cancelled": True}

    from sqlalchemy import select

    from app.database import async_session_factory
    from app.models import Paper, PaperStatus
    from app.models.chunk import PaperChunk
    from app.services.ocr_service import OCRService

    project_id = state["project_id"]
    processed = 0

    async with async_session_factory() as db:
        stmt = select(Paper).where(
            Paper.project_id == project_id,
            Paper.status == PaperStatus.PDF_DOWNLOADED,
            Paper.pdf_path != "",
        )
        papers = (await db.execute(stmt)).scalars().all()

        with OCRService(use_gpu=True) as ocr:
            for paper in papers:
                if state.get("cancelled"):
                    break
                try:
                    result = await ocr.process_pdf_async(paper.pdf_path)
                    if result.get("error"):
                        paper.status = PaperStatus.ERROR
                        continue

                    if result.get("method") == "mineru":
                        chunks = ocr.chunk_mineru_markdown(result["md_content"], chunk_size=1024, overlap=100)
                    else:
                        pages = result.get("pages", [])
                        chunks = ocr.chunk_text(pages, chunk_size=1024, overlap=100)

                    for chunk_data in chunks:
                        db.add(
                            PaperChunk(
                                paper_id=paper.id,
                                content=chunk_data["content"],
                                page_number=chunk_data.get("page_number", 0),
                                chunk_index=chunk_data["chunk_index"],
                                chunk_type=chunk_data.get("chunk_type", "text"),
                                section=chunk_data.get("section", ""),
                                token_count=chunk_data.get("token_count", 0),
                                has_formula=chunk_data.get("has_formula", False),
                                figure_path=chunk_data.get("figure_path", ""),
                            )
                        )

                    paper.status = PaperStatus.OCR_COMPLETE
                    processed += 1
                except Exception as e:
                    logger.warning("OCR failed for paper %d: %s", paper.id, e)
                    paper.status = PaperStatus.ERROR
        await db.commit()

    return {
        "progress": 80,
        "stage": "ocr",
        "result": {"ocr_processed": processed},
    }


async def index_node(state: PipelineState) -> dict[str, Any]:
    """Index OCR-processed papers into the RAG vector store."""
    if _is_cancelled(state):
        return {"stage": "cancelled", "cancelled": True}

    from sqlalchemy import select

    from app.database import async_session_factory
    from app.models import Paper, PaperStatus
    from app.models.chunk import PaperChunk
    from app.services.rag_service import RAGService

    project_id = state["project_id"]
    indexed = 0

    async with async_session_factory() as db:
        stmt = select(Paper).where(
            Paper.project_id == project_id,
            Paper.status == PaperStatus.OCR_COMPLETE,
        )
        papers = (await db.execute(stmt)).scalars().all()
        rag = RAGService()

        paper_ids = [p.id for p in papers]
        all_chunks = (
            (await db.execute(select(PaperChunk).where(PaperChunk.paper_id.in_(paper_ids)))).scalars().all()
            if paper_ids
            else []
        )

        from collections import defaultdict

        chunks_by_paper: dict[int, list] = defaultdict(list)
        for c in all_chunks:
            chunks_by_paper[c.paper_id].append(c)

        for paper in papers:
            if state.get("cancelled"):
                break
            chunks = chunks_by_paper.get(paper.id, [])

            if not chunks:
                continue

            chunk_dicts = [
                {
                    "paper_id": paper.id,
                    "paper_title": paper.title,
                    "content": c.content,
                    "page_number": c.page_number,
                    "chunk_index": c.chunk_index,
                    "chunk_type": c.chunk_type,
                    "section": c.section,
                    "has_formula": c.has_formula,
                    "figure_path": c.figure_path,
                }
                for c in chunks
            ]

            try:
                await rag.index_chunks(project_id, chunk_dicts)
                paper.status = PaperStatus.INDEXED
                indexed += 1
            except Exception as e:
                logger.warning("Index failed for paper %d: %s", paper.id, e)

        await db.commit()

    return {
        "progress": 100,
        "stage": "index",
        "result": {"indexed": indexed},
    }
