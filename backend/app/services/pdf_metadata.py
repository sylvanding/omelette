"""Extract metadata from PDF files using PyMuPDF with Crossref enrichment.

Extraction strategy (ordered by reliability):
1. PDF document properties via PyMuPDF  (title, author, subject/journal, DOI)
2. Font-size heuristic on page 1         (title = largest non-decorative text)
3. Crossref API lookup by DOI            (authoritative title/authors/year/journal)
4. Regex fallback                        (DOI, abstract, year from raw text)
"""

from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path

import fitz
import httpx

from app.config import settings
from app.schemas.knowledge_base import NewPaperData

logger = logging.getLogger(__name__)

DOI_REGEX = re.compile(r"10\.\d{4,}/[^\s,;\"'<>\]]+")
YEAR_REGEX = re.compile(r"\b(19|20)\d{2}\b")
DROP_CAP_MAX_LEN = 2


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def extract_metadata(
    pdf_path: Path,
    fallback_title: str = "Untitled",
) -> NewPaperData:
    """Extract metadata from *pdf_path*, optionally enriching via Crossref."""
    local = await asyncio.to_thread(_extract_local, pdf_path, fallback_title)

    if local.doi:
        enriched = await _crossref_lookup(local.doi)
        if enriched:
            return _merge_metadata(local, enriched)

    return local


# ---------------------------------------------------------------------------
# Local extraction (PyMuPDF — fast, no network)
# ---------------------------------------------------------------------------


def _extract_local(pdf_path: Path, fallback_title: str) -> NewPaperData:
    title = fallback_title
    doi: str | None = None
    abstract = ""
    year: int | None = None
    journal = ""
    authors: list[dict[str, str]] | None = None

    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        logger.warning("Cannot open %s with PyMuPDF: %s", pdf_path, exc)
        return NewPaperData(
            title=fallback_title,
            pdf_path=str(pdf_path),
            source="pdf_upload",
        )

    try:
        meta = doc.metadata or {}

        # --- title from document properties ---------------------------------
        meta_title = (meta.get("title") or "").strip()
        if meta_title and len(meta_title) > 3:
            title = meta_title

        # --- author from document properties --------------------------------
        meta_author = (meta.get("author") or "").strip()
        if meta_author:
            names = re.split(r"[;,]", meta_author)
            authors = [{"name": n.strip()} for n in names if n.strip()]

        # --- subject often holds journal + DOI ------------------------------
        subject = (meta.get("subject") or "").strip()
        if subject:
            doi_in_subject = DOI_REGEX.search(subject)
            if doi_in_subject:
                doi = _clean_doi(doi_in_subject.group(0))
                journal_part = subject[: doi_in_subject.start()].strip().rstrip(",").strip()
                if journal_part and "doi" not in journal_part.lower():
                    journal = journal_part

        # --- year from creationDate -----------------------------------------
        creation_date = (meta.get("creationDate") or "").strip()
        if creation_date:
            m = YEAR_REGEX.search(creation_date)
            if m:
                year = int(m.group(0))

        # --- font-size heuristic for title (when metadata lacks one) --------
        if title == fallback_title and doc.page_count > 0:
            font_title = _title_from_font_size(doc[0])
            if font_title:
                title = font_title

        # --- scan first pages for DOI, abstract, year ----------------------
        all_text = ""
        for i, page in enumerate(doc):
            if i >= 3:
                break
            text = page.get_text() or ""
            all_text += text + "\n"

        if not doi:
            doi_match = DOI_REGEX.search(all_text)
            if doi_match:
                doi = _clean_doi(doi_match.group(0))

        if not abstract:
            abstract = _extract_abstract(all_text)

        if year is None:
            ym = YEAR_REGEX.search(all_text)
            if ym:
                year = int(ym.group(0))

    except Exception as exc:
        logger.warning("Error extracting metadata from %s: %s", pdf_path, exc)
    finally:
        doc.close()

    return NewPaperData(
        title=title or fallback_title,
        abstract=abstract,
        authors=authors,
        doi=doi,
        year=year,
        journal=journal,
        pdf_path=str(pdf_path),
        source="pdf_upload",
    )


def _title_from_font_size(page: fitz.Page) -> str | None:
    """Identify the title as the largest-font text block on the first page.

    Ignores drop-caps (single oversized characters) and very short strings.
    """
    spans: list[tuple[float, float, str]] = []
    try:
        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
    except Exception:
        return None

    for block in blocks:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                text = span["text"].strip()
                if text and len(text) > DROP_CAP_MAX_LEN:
                    spans.append((span["size"], span["origin"][1], text))

    if not spans:
        return None

    max_size = max(s[0] for s in spans)
    body_sizes = sorted({s[0] for s in spans})
    if len(body_sizes) < 2:
        return None

    second_largest = body_sizes[-2]
    if max_size - second_largest < 2.0:
        return None

    title_spans = [s for s in spans if abs(s[0] - max_size) < 1.0]
    title_spans.sort(key=lambda s: s[1])
    title = " ".join(s[2] for s in title_spans).strip()

    if len(title) < 5 or len(title) > 500:
        return None

    return title


def _extract_abstract(text: str) -> str:
    patterns = [
        re.compile(
            r"\bAbstract\b[:\s.\-]*(.+?)(?=\n\s*\n|\nIntroduction\b|\nKeywords?\b|\n1[\s.]+|\Z)",
            re.DOTALL | re.IGNORECASE,
        ),
        re.compile(
            r"\bSummary\b[:\s.\-]*(.+?)(?=\n\s*\n|\nIntroduction\b|\nKeywords?\b|\n1[\s.]+|\Z)",
            re.DOTALL | re.IGNORECASE,
        ),
    ]
    for pat in patterns:
        m = pat.search(text)
        if m:
            abstract = m.group(1).strip()
            abstract = re.sub(r"\s+", " ", abstract)
            return abstract[:2000]
    return ""


def _clean_doi(raw: str) -> str:
    return raw.rstrip(".,;:)'\"]}")


# ---------------------------------------------------------------------------
# Crossref enrichment (async network call)
# ---------------------------------------------------------------------------


async def _crossref_lookup(doi: str) -> NewPaperData | None:
    """Fetch authoritative metadata from Crossref by DOI."""
    url = f"https://api.crossref.org/works/{doi}"
    proxy = settings.http_proxy or None
    try:
        async with httpx.AsyncClient(proxy=proxy, timeout=10.0) as client:
            resp = await client.get(
                url,
                headers={"User-Agent": f"Omelette/1.0 (mailto:{settings.unpaywall_email or 'dev@example.com'})"},
            )
            if resp.status_code != 200:
                logger.debug("Crossref returned %d for DOI %s", resp.status_code, doi)
                return None
            item = resp.json().get("message", {})
    except Exception as exc:
        logger.debug("Crossref lookup failed for DOI %s: %s", doi, exc)
        return None

    titles = item.get("title", [])
    title = titles[0] if titles else ""

    cr_authors = []
    for a in item.get("author") or []:
        given = a.get("given", "")
        family = a.get("family", "")
        name = f"{given} {family}".strip() or a.get("name", "")
        if name:
            cr_authors.append({"name": name})

    container = item.get("container-title", [])
    journal = container[0] if container else ""

    year: int | None = None
    for date_field in ("published", "issued", "created"):
        date_obj = item.get(date_field)
        if date_obj:
            parts = date_obj.get("date-parts", [[]])
            if parts and parts[0]:
                year = parts[0][0]
                break

    abstract = item.get("abstract", "")
    if abstract:
        abstract = re.sub(r"<[^>]+>", "", abstract).strip()[:2000]

    return NewPaperData(
        title=title,
        abstract=abstract,
        authors=cr_authors or None,
        doi=doi,
        year=year,
        journal=journal,
        source="crossref",
    )


def _merge_metadata(local: NewPaperData, crossref: NewPaperData) -> NewPaperData:
    """Prefer Crossref values but keep local data as fallback."""
    return NewPaperData(
        title=crossref.title or local.title,
        abstract=crossref.abstract or local.abstract,
        authors=crossref.authors or local.authors,
        doi=crossref.doi or local.doi,
        year=crossref.year or local.year,
        journal=crossref.journal or local.journal,
        pdf_path=local.pdf_path,
        source=local.source,
    )
