"""Tests for paper processing — PDF metadata extraction and DOI parsing.

PDF metadata and DOI logic live in pdf_metadata.py, used by upload, dedup,
and pipeline nodes in the paper processing flow.
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.schemas.knowledge_base import NewPaperData


class TestDoiParsing:
    """Tests for DOI regex and cleaning."""

    def test_doi_regex_matches_valid_doi(self):
        from app.services.pdf_metadata import DOI_REGEX

        assert DOI_REGEX.search("10.1234/abc.def") is not None
        assert DOI_REGEX.search("10.1038/nature12345") is not None
        assert DOI_REGEX.search("DOI: 10.1000/xyz123") is not None
        text = "Published in Journal. doi:10.1234/foo-bar_2024"
        m = DOI_REGEX.search(text)
        assert m is not None
        assert "10.1234/foo-bar_2024" in m.group(0)

    def test_doi_regex_rejects_invalid(self):
        from app.services.pdf_metadata import DOI_REGEX

        assert DOI_REGEX.search("10.12/too-short") is None
        assert DOI_REGEX.search("10.123") is None
        assert DOI_REGEX.search("not-a-doi") is None

    def test_clean_doi_strips_trailing_punctuation(self):
        from app.services.pdf_metadata import _clean_doi

        assert _clean_doi("10.1234/abc.") == "10.1234/abc"
        assert _clean_doi("10.1234/abc);") == "10.1234/abc"
        assert _clean_doi('10.1234/abc"') == "10.1234/abc"
        assert _clean_doi("10.1234/abc") == "10.1234/abc"


class TestPdfMetadataExtraction:
    """Tests for PDF metadata extraction."""

    @pytest.mark.asyncio
    async def test_extract_metadata_returns_new_paper_data(self):
        from app.services.pdf_metadata import extract_metadata

        with TempPdfMock(title="Test Paper", author="Alice", doi="10.1234/test"):
            path = Path("/tmp/fake.pdf")
            result = await extract_metadata(path, fallback_title="Fallback")
            assert isinstance(result, NewPaperData)
            assert result.title == "Test Paper"
            assert result.doi == "10.1234/test"
            assert result.authors is not None
            assert len(result.authors) >= 1

    @pytest.mark.asyncio
    async def test_extract_metadata_fallback_title_when_empty(self):
        from app.services.pdf_metadata import extract_metadata

        with TempPdfMock(title="", author="", doi=None):
            path = Path("/tmp/fake.pdf")
            result = await extract_metadata(path, fallback_title="Untitled")
            assert result.title == "Untitled"

    @pytest.mark.asyncio
    async def test_extract_metadata_handles_unopenable_pdf(self):
        from app.services.pdf_metadata import extract_metadata

        with patch("app.services.pdf_metadata.fitz") as mock_fitz:
            mock_fitz.open.side_effect = OSError("Cannot open file")
            path = Path("/nonexistent.pdf")
            result = await extract_metadata(path, fallback_title="Fallback")
            assert result.title == "Fallback"
            assert result.pdf_path == str(path)
            assert result.source == "pdf_upload"


class TempPdfMock:
    """Context manager to mock fitz.open for metadata extraction tests."""

    def __init__(self, *, title="", author="", doi=None, subject=""):
        self.title = title
        self.author = author
        self.doi = doi
        self.subject = subject or (f"Journal, {doi}" if doi else "")

    def __enter__(self):
        mock_page = MagicMock()
        mock_page.get_text.side_effect = lambda mode=None, **kw: ({"blocks": []} if mode == "dict" else "")

        mock_doc = MagicMock()
        mock_doc.metadata = {
            "title": self.title,
            "author": self.author,
            "subject": self.subject,
            "creationDate": "D:20240101120000",
        }
        mock_doc.page_count = 1
        mock_doc.__getitem__ = lambda idx: mock_page
        mock_doc.__iter__ = lambda self: iter([mock_page])
        mock_doc.close = MagicMock()

        self.patcher = patch("app.services.pdf_metadata.fitz.open", return_value=mock_doc)
        self.patcher.start()
        return self

    def __exit__(self, *args):
        self.patcher.stop()
