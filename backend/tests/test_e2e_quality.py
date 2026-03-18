"""Quality comparison tests: MinerU vs pdfplumber extraction.

Compares the same PDF processed by both methods and logs quality metrics.
No hard assertions on which is better — just records the comparison.

Requires: MinerU service running + omelette conda env with pdfplumber.
Run: pytest tests/test_e2e_quality.py -v -s
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import httpx
import pdfplumber
import pytest

E2E_PDF_DIR = Path(os.getenv("E2E_PDF_DIR", "/data0/djx/omelette_pdf_test"))
MINERU_URL = os.getenv("MINERU_API_URL", "http://localhost:8010")

logger = logging.getLogger(__name__)


def _mineru_reachable() -> bool:
    try:
        return httpx.get(f"{MINERU_URL}/docs", timeout=5).status_code == 200
    except Exception:
        return False


pytestmark = [
    pytest.mark.skipif(not _mineru_reachable(), reason=f"MinerU not reachable at {MINERU_URL}"),
    pytest.mark.e2e,
]


@pytest.fixture(scope="module")
def test_pdf() -> Path:
    if not E2E_PDF_DIR.exists():
        pytest.skip(f"PDF test dir not found: {E2E_PDF_DIR}")
    pdfs = sorted(E2E_PDF_DIR.glob("*.pdf"))
    if not pdfs:
        pytest.skip("No PDFs found")
    return pdfs[0]


def _extract_pdfplumber(pdf_path: Path) -> dict:
    """Extract text using pdfplumber (baseline)."""
    pages = []
    total_chars = 0
    table_count = 0
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text(x_tolerance=1) or ""
                tables = page.extract_tables() or []
                pages.append(text)
                total_chars += len(text)
                table_count += len(tables)
    except Exception as e:
        return {"error": str(e)}

    full_text = "\n".join(pages)
    return {
        "method": "pdfplumber",
        "total_chars": total_chars,
        "page_count": len(pages),
        "has_formulas": "$" in full_text,
        "table_count": table_count,
        "chunk_estimate": max(1, total_chars // 1024),
        "sample": full_text[:500],
    }


def _extract_mineru(pdf_path: Path) -> dict:
    """Extract text using MinerU API."""
    try:
        with open(pdf_path, "rb") as f:
            r = httpx.post(
                f"{MINERU_URL}/file_parse",
                data={
                    "backend": "pipeline",
                    "return_md": "true",
                    "return_content_list": "false",
                    "return_images": "false",
                    "formula_enable": "true",
                    "table_enable": "true",
                },
                files={"files": (pdf_path.name, f, "application/pdf")},
                timeout=600,
            )
    except Exception as e:
        return {"error": str(e)}

    if r.status_code != 200:
        return {"error": f"HTTP {r.status_code}"}

    body = r.json()
    results = body.get("results", {})
    if not results:
        return {"error": "empty results"}

    file_result = next(iter(results.values()))
    md_content = file_result.get("md_content", "")

    return {
        "method": "mineru",
        "total_chars": len(md_content),
        "has_formulas": "$" in md_content,
        "table_count": md_content.count("|---|"),
        "chunk_estimate": max(1, len(md_content) // 1024),
        "version": body.get("version", "unknown"),
        "sample": md_content[:500],
    }


class TestMinerUVsPdfplumber:
    def test_extraction_comparison(self, test_pdf):
        """Compare MinerU and pdfplumber extraction quality for the same PDF."""
        logger.info("Testing PDF: %s", test_pdf.name)

        plumber = _extract_pdfplumber(test_pdf)
        mineru = _extract_mineru(test_pdf)

        logger.info("=" * 60)
        logger.info("QUALITY COMPARISON: %s", test_pdf.name)
        logger.info("=" * 60)

        if plumber.get("error"):
            logger.warning("pdfplumber failed: %s", plumber["error"])
        else:
            logger.info(
                "pdfplumber: %d chars, %d tables, formulas=%s, ~%d chunks",
                plumber["total_chars"],
                plumber["table_count"],
                plumber["has_formulas"],
                plumber["chunk_estimate"],
            )

        if mineru.get("error"):
            logger.warning("MinerU failed: %s", mineru["error"])
        else:
            logger.info(
                "MinerU:     %d chars, %d tables, formulas=%s, ~%d chunks (v%s)",
                mineru["total_chars"],
                mineru["table_count"],
                mineru["has_formulas"],
                mineru["chunk_estimate"],
                mineru.get("version", "?"),
            )

        if not plumber.get("error") and not mineru.get("error"):
            ratio = mineru["total_chars"] / max(plumber["total_chars"], 1)
            logger.info("MinerU/pdfplumber char ratio: %.2f", ratio)
            logger.info(
                "MinerU formula detection: %s (pdfplumber: %s)", mineru["has_formulas"], plumber["has_formulas"]
            )

        assert not plumber.get("error") or not mineru.get("error"), "Both methods failed"

    def test_all_pdfs_comparison(self):
        """Compare all PDFs and produce a summary table."""
        if not E2E_PDF_DIR.exists():
            pytest.skip(f"PDF test dir not found: {E2E_PDF_DIR}")
        pdfs = sorted(E2E_PDF_DIR.glob("*.pdf"))
        if not pdfs:
            pytest.skip("No PDFs found")

        logger.info("\n" + "=" * 80)
        logger.info("FULL COMPARISON TABLE")
        logger.info("%-50s %10s %10s %8s", "PDF", "pdfplumber", "MinerU", "Ratio")
        logger.info("-" * 80)

        for pdf in pdfs:
            plumber = _extract_pdfplumber(pdf)
            mineru = _extract_mineru(pdf)

            p_chars = plumber.get("total_chars", 0) if not plumber.get("error") else -1
            m_chars = mineru.get("total_chars", 0) if not mineru.get("error") else -1
            ratio = m_chars / max(p_chars, 1) if p_chars > 0 and m_chars > 0 else 0

            logger.info("%-50s %10d %10d %8.2f", pdf.name[:50], p_chars, m_chars, ratio)

        logger.info("=" * 80)
