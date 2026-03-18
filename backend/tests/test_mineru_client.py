"""Tests for MinerU API client.

Unit tests run with mocked HTTP; E2E tests require a running MinerU service.
"""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.mineru_client import MinerUClient

E2E_PDF_DIR = Path(os.getenv("E2E_PDF_DIR", "/data0/djx/omelette_pdf_test"))
MINERU_URL = os.getenv("MINERU_API_URL", "http://localhost:8010")


def _mineru_reachable() -> bool:
    try:
        return httpx.get(f"{MINERU_URL}/docs", timeout=5).status_code == 200
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Unit tests (mocked HTTP)
# ---------------------------------------------------------------------------


class TestMinerUClientUnit:
    """Unit tests — no real MinerU service needed."""

    @pytest.mark.asyncio
    async def test_health_check_success(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            client = MinerUClient(base_url="http://fake:8010")
            assert await client.health_check() is True

    @pytest.mark.asyncio
    async def test_health_check_failure(self):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            client = MinerUClient(base_url="http://fake:8010")
            assert await client.health_check() is False

    @pytest.mark.asyncio
    async def test_parse_pdf_file_not_found(self):
        client = MinerUClient(base_url="http://fake:8010")
        result = await client.parse_pdf("/nonexistent/path.pdf")
        assert "error" in result
        assert "not found" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_parse_pdf_timeout(self, tmp_path):
        pdf = tmp_path / "test.pdf"
        pdf.write_bytes(b"%PDF-1.4 fake content")

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            client = MinerUClient(base_url="http://fake:8010", timeout=10)
            result = await client.parse_pdf(pdf)
            assert "error" in result
            assert "timeout" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_parse_pdf_connect_error(self, tmp_path):
        pdf = tmp_path / "test.pdf"
        pdf.write_bytes(b"%PDF-1.4 fake content")

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=httpx.ConnectError("refused"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            client = MinerUClient(base_url="http://fake:8010")
            result = await client.parse_pdf(pdf)
            assert "error" in result
            assert "connect" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_parse_pdf_api_error_status(self, tmp_path):
        pdf = tmp_path / "test.pdf"
        pdf.write_bytes(b"%PDF-1.4 fake content")

        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal Server Error"

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            client = MinerUClient(base_url="http://fake:8010")
            result = await client.parse_pdf(pdf)
            assert "error" in result
            assert "500" in result["error"]

    @pytest.mark.asyncio
    async def test_parse_pdf_success(self, tmp_path):
        pdf = tmp_path / "test.pdf"
        pdf.write_bytes(b"%PDF-1.4 fake content")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "backend": "pipeline",
            "version": "2.7.6",
            "results": {
                "test.pdf": {
                    "md_content": "# Title\n\nSome extracted text from the PDF.",
                    "content_list": [],
                }
            },
        }

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            client = MinerUClient(base_url="http://fake:8010")
            result = await client.parse_pdf(pdf)
            assert "error" not in result
            assert "md_content" in result
            assert len(result["md_content"]) > 10
            assert result["backend"] == "pipeline"
            assert result["version"] == "2.7.6"


# ---------------------------------------------------------------------------
# E2E tests (require running MinerU service)
# ---------------------------------------------------------------------------


@pytest.mark.e2e
@pytest.mark.skipif(not _mineru_reachable(), reason=f"MinerU not reachable at {MINERU_URL}")
class TestMinerUClientE2E:
    """Integration tests against a live MinerU service."""

    @pytest.mark.asyncio
    async def test_health_check_live(self):
        client = MinerUClient(base_url=MINERU_URL)
        assert await client.health_check() is True

    @pytest.mark.asyncio
    async def test_parse_real_pdf(self):
        if not E2E_PDF_DIR.exists():
            pytest.skip(f"PDF test dir not found: {E2E_PDF_DIR}")
        pdfs = sorted(E2E_PDF_DIR.glob("*.pdf"))
        if not pdfs:
            pytest.skip("No PDFs found")

        pdf = pdfs[0]
        client = MinerUClient(base_url=MINERU_URL, timeout=600)
        result = await client.parse_pdf(pdf, start_page=0, end_page=2)

        assert "error" not in result, f"MinerU parse failed: {result.get('error')}"
        assert "md_content" in result
        assert len(result["md_content"]) > 50, "Extracted content too short"
        assert "backend" in result
        assert "version" in result

    @pytest.mark.asyncio
    async def test_parse_returns_backend_and_version(self):
        if not E2E_PDF_DIR.exists():
            pytest.skip(f"PDF test dir not found: {E2E_PDF_DIR}")
        pdfs = sorted(E2E_PDF_DIR.glob("*.pdf"))
        if not pdfs:
            pytest.skip("No PDFs found")

        pdf = pdfs[0]
        client = MinerUClient(base_url=MINERU_URL, timeout=600)
        result = await client.parse_pdf(pdf, start_page=0, end_page=0)

        assert result.get("backend") in ("pipeline", "hybrid-auto-engine", "vlm-auto-engine")
        assert result.get("version", "") != ""
