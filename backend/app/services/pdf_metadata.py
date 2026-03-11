"""Extract metadata from PDF files using pdfplumber."""

import logging
import re
from pathlib import Path

import pdfplumber

from app.schemas.knowledge_base import NewPaperData

logger = logging.getLogger(__name__)

DOI_REGEX = re.compile(r"10\.\d{4,}/[^\s]+")


def extract_metadata(pdf_path: Path, fallback_title: str = "Untitled") -> NewPaperData:
    """Extract title, DOI, abstract, and year from PDF using pdfplumber."""
    title = fallback_title
    doi: str | None = None
    abstract = ""
    year: int | None = None
    journal = ""

    try:
        with pdfplumber.open(pdf_path) as pdf:
            all_text = ""
            for i, page in enumerate(pdf.pages):
                if i >= 3:
                    break
                text = page.extract_text() or ""
                all_text += text + "\n"

                if i == 0:
                    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
                    if lines:
                        title = lines[0]

                doi_match = DOI_REGEX.search(text)
                if doi_match and not doi:
                    doi = doi_match.group(0).rstrip(".,;:)")

            abstract_match = re.search(
                r"\bAbstract\b[:\s]*(.+?)(?=\n\n|\nIntroduction|\nKeywords|\Z)",
                all_text,
                re.DOTALL | re.IGNORECASE,
            )
            if abstract_match:
                abstract = abstract_match.group(1).strip()[:2000]

            year_match = re.search(r"\b(19|20)\d{2}\b", all_text)
            if year_match:
                year = int(year_match.group(0))

    except (ValueError, KeyError, OSError) as e:
        logger.warning("Failed to extract metadata from %s: %s", pdf_path, e)

    return NewPaperData(
        title=title or fallback_title,
        abstract=abstract,
        authors=None,
        doi=doi,
        year=year,
        journal=journal,
        pdf_path=str(pdf_path),
        source="pdf_upload",
    )
