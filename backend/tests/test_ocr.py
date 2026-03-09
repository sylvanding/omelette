"""Tests for OCR service and API."""

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.database import Base, engine
from app.models import Paper, PaperChunk, PaperStatus, Project


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def mock_pages():
    # Need total_chars > 100 for native extraction to succeed
    text1 = "This is page one text with enough content. " * 3
    text2 = "Page two content here with more text for the second page."
    return [
        {
            "page_number": 1,
            "text": text1,
            "tables": [],
            "has_text": True,
            "char_count": len(text1),
        },
        {
            "page_number": 2,
            "text": text2,
            "tables": [["Header", "Value"], ["Data", "123"]],
            "has_text": True,
            "char_count": len(text2),
        },
    ]


class TestOCRService:
    """Unit tests for OCRService."""

    def test_chunk_text(self, mock_pages):
        from app.services.ocr_service import OCRService

        service = OCRService()
        chunks = service.chunk_text(mock_pages, chunk_size=50, overlap=5)
        assert len(chunks) >= 1
        for c in chunks:
            assert "content" in c
            assert "page_number" in c
            assert "chunk_index" in c
            assert c["chunk_type"] in ("text", "table")
            assert "token_count" in c
        # Tables should be separate chunks
        table_chunks = [c for c in chunks if c["chunk_type"] == "table"]
        assert len(table_chunks) >= 1

    def test_save_result(self, mock_pages):
        from app.services.ocr_service import OCRService

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("app.services.ocr_service.settings") as mock_settings:
                mock_settings.ocr_output_dir = tmpdir
                service = OCRService()
                service.output_dir = Path(tmpdir)
                result = {"method": "native", "pages": mock_pages, "total_pages": 2}
                path = service.save_result(paper_id=42, result=result)
                assert path.exists()
                data = json.loads(path.read_text())
                assert data["method"] == "native"
                assert len(data["pages"]) == 2

    @patch("app.services.ocr_service.pdfplumber")
    def test_extract_text_native(self, mock_pdfplumber, mock_pages):
        from app.services.ocr_service import OCRService

        mock_page0 = MagicMock()
        mock_page0.extract_text.return_value = mock_pages[0]["text"]
        mock_page0.extract_tables.return_value = []
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = mock_pages[1]["text"]
        mock_page1.extract_tables.return_value = mock_pages[1]["tables"]
        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page0, mock_page1]

        cm = MagicMock()
        cm.__enter__.return_value = mock_pdf
        cm.__exit__.return_value = None
        mock_pdfplumber.open.return_value = cm

        service = OCRService()
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            pdf_path = f.name
        try:
            pages = service.extract_text_native(pdf_path)
            assert len(pages) == 2
            assert pages[0]["text"] == mock_pages[0]["text"]
            assert pages[0]["has_text"] is True
            assert pages[1]["tables"] == mock_pages[1]["tables"]
        finally:
            Path(pdf_path).unlink(missing_ok=True)

    @patch("app.services.ocr_service.pdfplumber")
    def test_process_pdf_native_success(self, mock_pdfplumber, mock_pages):
        from app.services.ocr_service import OCRService

        mock_page0 = MagicMock()
        mock_page0.extract_text.return_value = mock_pages[0]["text"]
        mock_page0.extract_tables.return_value = []
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = mock_pages[1]["text"]
        mock_page1.extract_tables.return_value = mock_pages[1]["tables"]
        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page0, mock_page1]

        cm = MagicMock()
        cm.__enter__.return_value = mock_pdf
        cm.__exit__.return_value = None
        mock_pdfplumber.open.return_value = cm

        service = OCRService()
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            pdf_path = f.name
        try:
            result = service.process_pdf(pdf_path, force_ocr=False)
            assert result["method"] == "native"
            assert result["total_pages"] == 2
            assert result["total_chars"] > 100
            assert result["pages_with_text"] == 2
        finally:
            Path(pdf_path).unlink(missing_ok=True)

    @patch("app.services.ocr_service.pdfplumber")
    def test_process_pdf_fallback_to_ocr_when_insufficient_text(self, mock_pdfplumber):
        from app.services.ocr_service import OCRService

        # Simulate scanned PDF: empty or minimal text
        mock_page0 = MagicMock()
        mock_page0.extract_text.return_value = ""
        mock_page0.extract_tables.return_value = []
        mock_page1 = MagicMock()
        mock_page1.extract_text.return_value = "x" * 10
        mock_page1.extract_tables.return_value = []
        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page0, mock_page1]

        cm = MagicMock()
        cm.__enter__.return_value = mock_pdf
        cm.__exit__.return_value = None
        mock_pdfplumber.open.return_value = cm

        # Mock PaddleOCR as unavailable
        with patch.object(OCRService, "_get_paddle_ocr", return_value=None):
            service = OCRService()
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
                pdf_path = f.name
            try:
                result = service.process_pdf(pdf_path, force_ocr=False)
                # Should fall back to OCR, which returns [] when unavailable
                assert result["method"] in ("paddleocr", "failed")
                assert result["total_pages"] == 0 or "pages" in result
            finally:
                Path(pdf_path).unlink(missing_ok=True)

    def test_process_pdf_file_not_found(self):
        from app.services.ocr_service import OCRService

        service = OCRService()
        result = service.process_pdf("/nonexistent/path.pdf")
        assert "error" in result
        assert "pages" in result
        assert result["pages"] == []


class TestOCRAPI:
    """API endpoint tests."""

    @pytest.mark.asyncio
    async def test_ocr_stats_no_project(self, client):
        resp = await client.get("/api/v1/projects/99999/ocr/stats")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_ocr_stats_with_project(self, client):
        # Create project first
        create_resp = await client.post("/api/v1/projects", json={"name": "OCR Test"})
        assert create_resp.status_code == 201
        project_id = create_resp.json()["data"]["id"]

        resp = await client.get(f"/api/v1/projects/{project_id}/ocr/stats")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert "data" in body
        assert "total_chunks" in body["data"]
        assert "pending" in body["data"] or "pdf_downloaded" in body["data"]

    @pytest.mark.asyncio
    async def test_ocr_process_no_papers(self, client):
        create_resp = await client.post("/api/v1/projects", json={"name": "OCR Empty"})
        assert create_resp.status_code == 201
        project_id = create_resp.json()["data"]["id"]

        resp = await client.post(f"/api/v1/projects/{project_id}/ocr/process")
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["processed"] == 0
        assert body["data"]["total"] == 0
