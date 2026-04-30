"""Tests for reference manager export endpoints (BibTeX, RIS, Zotero)."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app


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


async def _create_paper(client: AsyncClient, project_id: int, **kwargs) -> int:
    """Create a paper and return its ID."""
    defaults = {
        "title": "Test Paper",
        "abstract": "A test abstract",
        "year": 2024,
        "authors": [{"name": "Alice Smith"}, {"name": "Bob Jones"}],
        "journal": "Test Journal",
        "doi": "10.1234/test",
    }
    defaults.update(kwargs)
    resp = await client.post(f"/api/v1/projects/{project_id}/papers", json=defaults)
    assert resp.status_code == 201
    return resp.json()["data"]["id"]


class TestBibtexExportAPI:
    """Integration tests for BibTeX export endpoint."""

    @pytest.mark.asyncio
    async def test_returns_valid_bibtex(self, client: AsyncClient, project_id: int):
        """Verify the endpoint returns valid BibTeX entries."""
        await _create_paper(client, project_id, title="Deep Learning Advances")
        resp = await client.post(f"/api/v1/projects/{project_id}/export/bibtex")
        assert resp.status_code == 200
        content = resp.text
        assert "@article{" in content
        assert "title = {Deep Learning Advances}" in content
        assert "author = {Alice Smith and Bob Jones}" in content
        assert "year = {2024}" in content
        assert "journal = {Test Journal}" in content
        assert "doi = {10.1234/test}" in content

    @pytest.mark.asyncio
    async def test_includes_all_required_fields(self, client: AsyncClient, project_id: int):
        """Verify BibTeX export includes title, author, year, journal, doi, abstract."""
        await _create_paper(client, project_id)
        resp = await client.post(f"/api/v1/projects/{project_id}/export/bibtex")
        assert resp.status_code == 200
        content = resp.text
        assert "title = {" in content
        assert "author = {" in content
        assert "year = {" in content
        assert "abstract = {" in content

    @pytest.mark.asyncio
    async def test_empty_project_returns_empty_string(self, client: AsyncClient, project_id: int):
        """Verify export returns empty content when no papers exist."""
        resp = await client.post(f"/api/v1/projects/{project_id}/export/bibtex")
        assert resp.status_code == 200
        assert resp.text.strip() == ""

    @pytest.mark.asyncio
    async def test_exports_all_project_papers(self, client: AsyncClient, project_id: int):
        """Verify all papers in the project are exported."""
        await _create_paper(client, project_id, title="Paper One", doi="10.1234/one")
        await _create_paper(client, project_id, title="Paper Two", doi="10.1234/two")
        resp = await client.post(f"/api/v1/projects/{project_id}/export/bibtex")
        assert resp.status_code == 200
        content = resp.text
        assert "Paper One" in content
        assert "Paper Two" in content


class TestRisExportAPI:
    """Integration tests for RIS export endpoint."""

    @pytest.mark.asyncio
    async def test_returns_valid_ris(self, client: AsyncClient, project_id: int):
        """Verify the endpoint returns valid RIS format."""
        await _create_paper(client, project_id)
        resp = await client.post(f"/api/v1/projects/{project_id}/export/ris")
        assert resp.status_code == 200
        content = resp.text
        assert "TY  - JOUR" in content
        assert "TI  - Test Paper" in content
        assert "AU  - Alice Smith" in content
        assert "AU  - Bob Jones" in content
        assert "PY  - 2024" in content
        assert "JO  - Test Journal" in content
        assert "DO  - 10.1234/test" in content
        assert "AB  - A test abstract" in content
        assert "ER  - " in content

    @pytest.mark.asyncio
    async def test_multiple_papers_separated(self, client: AsyncClient, project_id: int):
        """Verify multiple RIS entries are properly separated."""
        await _create_paper(client, project_id, title="First Paper", doi="10.1234/first")
        await _create_paper(client, project_id, title="Second Paper", doi="10.1234/second")
        resp = await client.post(f"/api/v1/projects/{project_id}/export/ris")
        assert resp.status_code == 200
        content = resp.text
        er_count = content.count("ER  - ")
        assert er_count == 2

    @pytest.mark.asyncio
    async def test_empty_project_returns_empty_string(self, client: AsyncClient, project_id: int):
        """Verify export returns empty content when no papers exist."""
        resp = await client.post(f"/api/v1/projects/{project_id}/export/ris")
        assert resp.status_code == 200
        assert resp.text.strip() == ""


class TestZoteroExportAPI:
    """Integration tests for Zotero export endpoint."""

    @pytest.mark.asyncio
    async def test_returns_preview_without_credentials(self, client: AsyncClient, project_id: int):
        """Verify endpoint returns BibTeX preview when Zotero credentials are missing."""
        await _create_paper(client, project_id)
        resp = await client.post(
            f"/api/v1/projects/{project_id}/export/zotero",
            json={"collection_name": "Test Collection"},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "preview" in data
        assert "message" in data

    @pytest.mark.asyncio
    async def test_requires_collection_name(self, client: AsyncClient, project_id: int):
        """Verify the endpoint rejects requests without a collection name."""
        resp = await client.post(f"/api/v1/projects/{project_id}/export/zotero", json={})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_requires_papers(self, client: AsyncClient, project_id: int):
        """Verify the endpoint rejects export when no papers exist."""
        resp = await client.post(
            f"/api/v1/projects/{project_id}/export/zotero",
            json={"collection_name": "Test Collection"},
        )
        assert resp.status_code == 400
