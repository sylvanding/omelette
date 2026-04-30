"""Tests for browser extension upload endpoint."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
async def setup_db():
    """Create tables before each test, drop after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    """Async HTTP client for in-process testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def project_id(client: AsyncClient) -> int:
    """Create a project and return its ID."""
    resp = await client.post("/api/v1/projects", json={"name": "Test Project", "domain": "optics"})
    assert resp.status_code == 201
    return resp.json()["data"]["id"]


# ---------------------------------------------------------------------------
# Browser Upload API Tests
# ---------------------------------------------------------------------------


class TestBrowserUploadAPI:
    """Integration tests for the browser upload endpoint."""

    @pytest.mark.asyncio
    async def test_capture_with_title_only(self, client: AsyncClient, project_id: int):
        """Verify the endpoint accepts a title-only capture request."""
        resp = await client.post(
            f"/api/v1/projects/{project_id}/upload/browser",
            params={"title": "Test Paper from Browser"},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["status"] == "captured"
        assert data["title"] == "Test Paper from Browser"
        assert data["paper_id"] is not None

    @pytest.mark.asyncio
    async def test_capture_with_tags(self, client: AsyncClient, project_id: int):
        """Verify tags are accepted and stored with the paper."""
        resp = await client.post(
            f"/api/v1/projects/{project_id}/upload/browser",
            params={"title": "Tagged Paper", "tags": "survey,ML,NLP"},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["status"] == "captured"

        # Verify tags were stored
        from sqlalchemy import select

        from app.database import async_session_factory
        from app.models import Paper

        async with async_session_factory() as db:
            paper = (await db.execute(select(Paper).where(Paper.id == data["paper_id"]))).scalar_one()
            assert paper.tags == ["survey", "ML", "NLP"]

    @pytest.mark.asyncio
    async def test_rejects_without_title_or_identifiers(self, client: AsyncClient, project_id: int):
        """Verify the endpoint rejects requests with no title, DOI, arXiv ID, or PDF URL."""
        resp = await client.post(
            f"/api/v1/projects/{project_id}/upload/browser",
            params={},
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_capture_with_doi_fallback(self, client: AsyncClient, project_id: int):
        """Verify DOI lookup is attempted (falls back gracefully if API unavailable)."""
        with patch("app.api.v1.browser_upload._fetch_by_doi", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = {
                "title": "DOI Lookup Paper",
                "abstract": "An abstract found via DOI",
                "doi": "10.1234/test",
                "year": 2024,
                "authors": [{"name": "Test Author"}],
                "journal": "Test Journal",
                "citation_count": 5,
                "source": "semantic_scholar",
                "source_id": "paper123",
                "pdf_url": "",
            }
            resp = await client.post(
                f"/api/v1/projects/{project_id}/upload/browser",
                params={"doi": "10.1234/test"},
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["title"] == "DOI Lookup Paper"
            assert data["status"] == "captured"

    @pytest.mark.asyncio
    async def test_capture_with_arxiv_fallback(self, client: AsyncClient, project_id: int):
        """Verify arXiv lookup is attempted."""
        with patch("app.api.v1.browser_upload._fetch_by_arxiv", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = {
                "title": "ArXiv Paper",
                "abstract": "An arXiv preprint",
                "doi": None,
                "year": 2024,
                "authors": [{"name": "ArXiv Author"}],
                "journal": "",
                "citation_count": 0,
                "source": "semantic_scholar",
                "source_id": "arxiv456",
                "pdf_url": "",  # No PDF URL to avoid network call
            }
            resp = await client.post(
                f"/api/v1/projects/{project_id}/upload/browser",
                params={"arxiv_id": "2401.12345"},
            )
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert data["title"] == "ArXiv Paper"
            assert data["status"] == "captured"

    @pytest.mark.asyncio
    async def test_duplicate_pdf_returns_duplicate_status(self, client: AsyncClient, project_id: int):
        """Verify duplicate PDF content returns a duplicate status."""
        # Create a small valid PDF-like content
        fake_pdf = b"%PDF-1.4 test content"

        with (
            patch("app.api.v1.browser_upload._download_pdf", new_callable=AsyncMock) as mock_dl,
            patch("app.api.v1.browser_upload._extract_metadata_from_content", new_callable=AsyncMock) as mock_meta,
        ):
            mock_dl.return_value = fake_pdf
            mock_meta.return_value = {
                "title": "Duplicate Test Paper",
                "abstract": "",
                "doi": None,
                "year": 2024,
                "authors": [],
                "journal": "",
            }

            # First upload
            resp1 = await client.post(
                f"/api/v1/projects/{project_id}/upload/browser",
                params={"pdf_url": "https://example.com/paper.pdf"},
            )
            assert resp1.status_code == 200

            # Second upload with same content should be detected as duplicate
            mock_dl.return_value = fake_pdf
            resp2 = await client.post(
                f"/api/v1/projects/{project_id}/upload/browser",
                params={"pdf_url": "https://example.com/paper.pdf"},
            )
            assert resp2.status_code == 200
            data = resp2.json()["data"]
            assert data["status"] == "duplicate"
