"""Tests for pdf_metadata service — mock fitz and httpx, verify extraction and Crossref fallback."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.knowledge_base import NewPaperData
from app.services import pdf_metadata

# ---------------------------------------------------------------------------
# test_extract_local_normal_pdf
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_extract_local_normal_pdf(tmp_path):
    """Mock fitz.open returning doc with title/author/doi metadata."""
    pdf_path = tmp_path / "normal.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 minimal")

    mock_doc = MagicMock()
    mock_doc.metadata = {
        "title": "Deep Learning for Microscopy",
        "author": "Alice Smith; Bob Jones",
        "subject": "Nature Methods, doi: 10.1234/test-paper",
        "creationDate": "2024-01-01",
    }
    mock_doc.page_count = 1
    mock_doc.__iter__ = lambda self: iter([])  # no pages to scan for DOI/abstract

    with patch("app.services.pdf_metadata.fitz.open", return_value=mock_doc):
        result = await pdf_metadata.extract_metadata(pdf_path, fallback_title="Untitled")

    assert isinstance(result, NewPaperData)
    assert result.title == "Deep Learning for Microscopy"
    assert result.authors == [{"name": "Alice Smith"}, {"name": "Bob Jones"}]
    assert result.doi == "10.1234/test-paper"
    assert result.year == 2024
    assert result.pdf_path == str(pdf_path)
    assert result.source == "pdf_upload"


# ---------------------------------------------------------------------------
# test_extract_local_corrupted_pdf
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_extract_local_corrupted_pdf(tmp_path):
    """Mock fitz.open raising; should return fallback title."""
    pdf_path = tmp_path / "corrupted.pdf"
    pdf_path.write_bytes(b"not a valid pdf")

    with patch("app.services.pdf_metadata.fitz.open", side_effect=Exception("Invalid PDF")):
        result = await pdf_metadata.extract_metadata(pdf_path, fallback_title="Fallback Title")

    assert isinstance(result, NewPaperData)
    assert result.title == "Fallback Title"
    assert result.pdf_path == str(pdf_path)
    assert result.source == "pdf_upload"


# ---------------------------------------------------------------------------
# test_extract_local_no_doi
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_extract_local_no_doi(tmp_path):
    """PDF with title/author but no DOI in metadata or text."""
    pdf_path = tmp_path / "no_doi.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 minimal")

    mock_doc = MagicMock()
    mock_doc.metadata = {
        "title": "Paper Without DOI",
        "author": "Jane Doe",
        "subject": "Some Journal",
        "creationDate": "",
    }
    mock_doc.page_count = 1
    mock_doc.__iter__ = lambda self: iter([])

    with patch("app.services.pdf_metadata.fitz.open", return_value=mock_doc):
        result = await pdf_metadata.extract_metadata(pdf_path, fallback_title="Untitled")

    assert result.title == "Paper Without DOI"
    assert result.authors == [{"name": "Jane Doe"}]
    assert result.doi is None


# ---------------------------------------------------------------------------
# test_extract_doi_cleaning
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_extract_doi_cleaning(tmp_path):
    """DOI with trailing punctuation/URL prefix should be cleaned."""
    pdf_path = tmp_path / "doi_clean.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 minimal")

    mock_doc = MagicMock()
    mock_doc.metadata = {
        "title": "Test",
        "author": "",
        "subject": "Journal, 10.5678/cleaned-doi).",
        "creationDate": "",
    }
    mock_doc.page_count = 1
    mock_doc.__iter__ = lambda self: iter([])

    with patch("app.services.pdf_metadata.fitz.open", return_value=mock_doc):
        result = await pdf_metadata.extract_metadata(pdf_path, fallback_title="Untitled")

    assert result.doi == "10.5678/cleaned-doi"


# ---------------------------------------------------------------------------
# test_lookup_crossref_success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_lookup_crossref_success(tmp_path):
    """Mock httpx returning Crossref metadata; should merge with local."""
    pdf_path = tmp_path / "with_doi.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 minimal")

    mock_doc = MagicMock()
    mock_doc.metadata = {
        "title": "Local Title",
        "author": "Local Author",
        "subject": "10.1234/crossref-test",
        "creationDate": "",
    }
    mock_doc.page_count = 1
    mock_doc.__iter__ = lambda self: iter([])

    crossref_response = {
        "message": {
            "title": ["Crossref Title"],
            "author": [{"given": "Crossref", "family": "Author"}],
            "container-title": ["Crossref Journal"],
            "published": {"date-parts": [[2023]]},
            "abstract": "<p>Crossref abstract</p>",
        }
    }

    async def mock_get(*args, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = crossref_response
        return resp

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.get = AsyncMock(side_effect=mock_get)

    with (
        patch("app.services.pdf_metadata.fitz.open", return_value=mock_doc),
        patch("app.services.pdf_metadata.httpx.AsyncClient", return_value=mock_client),
    ):
        result = await pdf_metadata.extract_metadata(pdf_path, fallback_title="Untitled")

    assert result.title == "Crossref Title"
    assert result.authors == [{"name": "Crossref Author"}]
    assert result.journal == "Crossref Journal"
    assert result.year == 2023
    assert result.abstract == "Crossref abstract"
    assert result.pdf_path == str(pdf_path)


# ---------------------------------------------------------------------------
# test_lookup_crossref_failure
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_lookup_crossref_failure(tmp_path):
    """Mock httpx raising; should fallback to local metadata."""
    pdf_path = tmp_path / "crossref_fail.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 minimal")

    mock_doc = MagicMock()
    mock_doc.metadata = {
        "title": "Local Only Title",
        "author": "Local Author",
        "subject": "10.9999/crossref-fail",
        "creationDate": "",
    }
    mock_doc.page_count = 1
    mock_doc.__iter__ = lambda self: iter([])

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.get = AsyncMock(side_effect=Exception("Network error"))

    with (
        patch("app.services.pdf_metadata.fitz.open", return_value=mock_doc),
        patch("app.services.pdf_metadata.httpx.AsyncClient", return_value=mock_client),
    ):
        result = await pdf_metadata.extract_metadata(pdf_path, fallback_title="Untitled")

    assert result.title == "Local Only Title"
    assert result.authors == [{"name": "Local Author"}]
    assert result.doi == "10.9999/crossref-fail"
    assert result.pdf_path == str(pdf_path)
