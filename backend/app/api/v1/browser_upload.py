"""Browser extension upload endpoint — one-click paper capture from the web."""

import asyncio
import hashlib
import logging
import tempfile
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_project
from app.config import settings
from app.middleware.rate_limit import limiter
from app.models import Paper, Project
from app.schemas.common import ApiResponse
from app.services.paper_processor import process_papers_background
from app.services.pdf_metadata import extract_metadata

logger = logging.getLogger(__name__)

router = APIRouter(tags=["browser"])

S2_BASE = "https://api.semanticscholar.org/graph/v1/paper"
S2_FIELDS = "title,abstract,authors,journal,year,citationCount,externalIds,openAccessPdf,url"


async def _download_pdf(url: str) -> bytes:
    """Download a PDF from a URL, respecting proxy settings."""
    proxy = settings.http_proxy or None
    async with httpx.AsyncClient(proxy=proxy, timeout=120) as client:
        resp = await client.get(url, follow_redirects=True)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Failed to download PDF: HTTP {resp.status_code}")
        content_type = resp.headers.get("content-type", "")
        if "application/pdf" not in content_type and not url.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="URL does not point to a PDF file")
        return resp.content


async def _s2_request(path: str, params: dict | None = None) -> dict | None:
    """Make a request to the Semantic Scholar API."""
    headers = {}
    if settings.semantic_scholar_api_key:
        headers["x-api-key"] = settings.semantic_scholar_api_key

    proxy = settings.http_proxy or None
    async with httpx.AsyncClient(proxy=proxy, timeout=settings.s2_timeout) as client:
        try:
            resp = await client.get(f"{S2_BASE}{path}", params=params, headers=headers or None)
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.warning("Semantic Scholar API request failed: %s", e)
    return None


def _s2_to_metadata(item: dict) -> dict:
    """Convert a Semantic Scholar API response to our metadata dict."""
    authors = []
    for a in item.get("authors", []) or []:
        authors.append({"name": a.get("name", ""), "affiliation": ""})

    doi = ""
    ext = item.get("externalIds") or {}
    if ext.get("DOI"):
        doi = ext["DOI"] if isinstance(ext["DOI"], str) else str(ext["DOI"])

    pdf_url = ""
    oa = item.get("openAccessPdf") or {}
    if oa.get("url"):
        pdf_url = oa["url"]

    return {
        "title": item.get("title", ""),
        "abstract": item.get("abstract") or "",
        "doi": doi or None,
        "year": item.get("year"),
        "authors": authors,
        "journal": (item.get("journal") or {}).get("name", ""),
        "citation_count": item.get("citationCount", 0),
        "source": "semantic_scholar",
        "source_id": item.get("paperId", ""),
        "pdf_url": pdf_url,
        "url": item.get("url", ""),
    }


async def _fetch_by_doi(doi: str) -> dict | None:
    """Fetch paper metadata from Semantic Scholar by DOI."""
    result = await _s2_request(f"/DOI:{doi}", params={"fields": S2_FIELDS})
    if result:
        return _s2_to_metadata(result)
    return None


async def _fetch_by_arxiv(arxiv_id: str) -> dict | None:
    """Fetch paper metadata from Semantic Scholar by arXiv ID."""
    result = await _s2_request(f"/ArXiv:{arxiv_id}", params={"fields": S2_FIELDS})
    if result:
        return _s2_to_metadata(result)
    return None


async def _download_pdf_from_metadata(meta: dict) -> bytes | None:
    """Try to download the PDF from metadata pdf_url."""
    pdf_url = meta.get("pdf_url")
    if pdf_url:
        try:
            return await _download_pdf(pdf_url)
        except HTTPException:
            return None
    return None


async def _extract_metadata_from_content(pdf_content: bytes) -> dict:
    """Extract metadata from PDF content bytes."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_content)
        tmp.flush()
        try:
            meta = await extract_metadata(tmp.name, fallback_title="Unknown Paper")
            return {
                "title": meta.title,
                "abstract": meta.abstract or "",
                "doi": meta.doi,
                "year": meta.year,
                "authors": meta.authors or [],
                "journal": meta.journal or "",
            }
        finally:
            Path(tmp.name).unlink(missing_ok=True)


@router.post(
    "/browser",
    response_model=ApiResponse[dict],
    summary="Capture a paper from the browser extension",
)
@limiter.limit("10/minute")
async def browser_upload(
    request: Request,
    project_id: int,
    pdf_url: str | None = Query(default=None),
    doi: str | None = Query(default=None),
    arxiv_id: str | None = Query(default=None),
    title: str | None = Query(default=None),
    tags: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    project: Project = Depends(get_project),
):
    """Accept a paper capture request from the browser extension.

    Accepts one of: pdf_url, doi, or arxiv_id.
    Fetches metadata, downloads PDF if available, and creates a paper record.
    """
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    # Resolve identifier: try direct URL, DOI, or arXiv
    pdf_content: bytes | None = None
    metadata: dict = {}

    if pdf_url:
        # Download PDF directly
        pdf_content = await _download_pdf(pdf_url)
        # Try to extract metadata from PDF
        try:
            meta = await _extract_metadata_from_content(pdf_content)
            metadata.update(meta)
        except Exception:
            logger.warning("Failed to extract metadata from PDF, will use Semantic Scholar fallback")

    if doi:
        meta = await _fetch_by_doi(doi)
        if meta:
            metadata.update(meta)
            # Try to download PDF if we didn't already
            if not pdf_content:
                pdf_content = await _download_pdf_from_metadata(meta)

    if arxiv_id:
        meta = await _fetch_by_arxiv(arxiv_id)
        if meta:
            metadata.update(meta)
            if not pdf_content:
                pdf_content = await _download_pdf_from_metadata(meta)

    if not pdf_content and not metadata.get("title") and not title:
        raise HTTPException(status_code=400, detail="Could not find a PDF or metadata for this paper")

    # Save PDF if we have it
    pdf_dir = Path(settings.pdf_dir)
    project_pdf_dir = pdf_dir / str(project_id)
    project_pdf_dir.mkdir(parents=True, exist_ok=True)

    saved_path = ""
    content_hash = ""
    status = "metadata_only"

    if pdf_content:
        content_hash = hashlib.sha256(pdf_content).hexdigest()

        # Check for exact content duplicate
        existing_stmt = select(Paper).where(Paper.project_id == project_id)
        existing_result = await db.execute(existing_stmt)
        existing_papers = list(existing_result.scalars().all())

        existing_by_hash = next((p for p in existing_papers if p.content_hash == content_hash), None)
        if existing_by_hash:
            return ApiResponse(
                data={
                    "status": "duplicate",
                    "message": f"Paper already exists: '{existing_by_hash.title}'",
                    "paper_id": existing_by_hash.id,
                }
            )

        safe_filename = f"{uuid.uuid4().hex}.pdf"
        saved_path = str(project_pdf_dir / safe_filename)
        Path(saved_path).write_bytes(pdf_content)
        status = "pdf_downloaded"

    # Fill in title from request if still missing
    resolved_title = metadata.get("title") or title
    if not resolved_title:
        raise HTTPException(status_code=400, detail="Could not determine paper title")

    paper = Paper(
        project_id=project_id,
        title=resolved_title,
        abstract=metadata.get("abstract") or "",
        authors=metadata.get("authors") or [],
        doi=metadata.get("doi"),
        year=metadata.get("year"),
        journal=metadata.get("journal") or "",
        source=metadata.get("source") or "browser_extension",
        source_id=metadata.get("source_id") or "",
        pdf_path=saved_path,
        pdf_url=pdf_url or metadata.get("pdf_url") or "",
        status=status,
        tags=tag_list,
        notes="",
        citation_count=metadata.get("citation_count") or 0,
        content_hash=content_hash,
        extra_metadata=metadata.get("extra_metadata") or {},
    )
    db.add(paper)
    await db.commit()
    await db.refresh(paper)

    # Kick off background processing if we have a PDF
    new_paper_ids: list[int] = []
    if status == "pdf_downloaded":
        new_paper_ids = [paper.id]
        asyncio.create_task(process_papers_background(project_id, new_paper_ids))

    return ApiResponse(
        data={
            "status": "captured",
            "paper_id": paper.id,
            "title": paper.title,
            "processing": bool(new_paper_ids),
        }
    )
