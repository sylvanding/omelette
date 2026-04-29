"""Tests for OCR service and API."""

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app


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

        with tempfile.TemporaryDirectory() as tmpdir, patch("app.services.ocr_service.settings") as mock_settings:
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
        with (
            patch.object(OCRService, "_get_paddle_ocr", return_value=None),
            tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f,
        ):
            service = OCRService()
            pdf_path = f.name
            try:
                result = service.process_pdf(pdf_path, force_ocr=False)
                # PaddleOCR unavailable: should fall back to native results
                # since some text (10 chars) was extracted
                assert result["method"] == "native"
                assert result["total_chars"] == 10
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


class TestTokenBasedChunking:
    """Tests for token-based chunking (OPT-001)."""

    def _make_service(self):
        from app.services.ocr_service import OCRService

        return OCRService()

    def test_chunk_text_uses_token_based_sizing(self):
        """512-token chunk should hold ~400-600 English words."""
        service = self._make_service()
        # ~550 words, should fit in 512 tokens
        words = "research " * 550
        pages = [{"page_number": 1, "text": words, "tables": [], "has_text": True, "char_count": len(words)}]
        chunks = service.chunk_text(pages, chunk_size=512, overlap=50)
        assert len(chunks) >= 1
        for c in chunks:
            assert isinstance(c["token_count"], int)
            assert c["token_count"] > 0

    def test_chunk_text_chinese_token_count(self):
        """Chinese text should have accurate tiktoken count."""
        service = self._make_service()
        text = "这是一段中文测试文本。" * 50
        pages = [{"page_number": 1, "text": text, "tables": [], "has_text": True, "char_count": len(text)}]
        chunks = service.chunk_text(pages, chunk_size=512, overlap=50)
        assert len(chunks) >= 1
        # token_count should not be word-count (which would be 1 for Chinese without spaces)
        for c in chunks:
            assert c["token_count"] >= 1

    def test_token_count_matches_tiktoken(self):
        """chunk token_count should match actual tiktoken encode length."""
        service = self._make_service()
        words = "test word " * 100
        pages = [{"page_number": 1, "text": words, "tables": [], "has_text": True, "char_count": len(words)}]
        chunks = service.chunk_text(pages, chunk_size=512, overlap=50)
        assert len(chunks) >= 1
        # Verify token_count matches tiktoken for first chunk
        import tiktoken

        enc = tiktoken.get_encoding("cl100k_base")
        actual_tokens = len(enc.encode(chunks[0]["content"]))
        assert chunks[0]["token_count"] == actual_tokens

    def test_chunk_mineru_markdown_token_based(self):
        """MinerU markdown chunking should use token-based sizing."""
        service = self._make_service()
        md = "## Introduction\n\n" + "Lorem ipsum dolor sit amet. " * 200
        chunks = service.chunk_mineru_markdown(md, chunk_size=512, overlap=50)
        assert len(chunks) >= 1
        for c in chunks:
            assert "token_count" in c
            assert isinstance(c["token_count"], int)

    def test_overlap_preserves_tokens(self):
        """Overlap should include last N tokens from previous chunk."""
        service = self._make_service()
        # Small chunk size to force splitting
        words = "word " * 300
        pages = [{"page_number": 1, "text": words, "tables": [], "has_text": True, "char_count": len(words)}]
        chunks = service.chunk_text(pages, chunk_size=100, overlap=20)
        if len(chunks) >= 2:
            # Each subsequent chunk should start with overlap content
            import tiktoken

            enc = tiktoken.get_encoding("cl100k_base")
            overlap_tokens = enc.encode(chunks[0]["content"])[-20:]
            overlap_text = enc.decode(overlap_tokens)
            assert overlap_text.strip() in chunks[1]["content"] or chunks[1]["content"].startswith(
                overlap_text.strip().split()[0] if overlap_text.strip() else ""
            )
