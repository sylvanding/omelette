"""Tests for AI library organization endpoints and service."""

from unittest.mock import AsyncMock, MagicMock, patch

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


def _make_mock_paper(paper_id: int, title: str, abstract: str, **kwargs):
    """Create a mock paper object with needed attributes."""
    paper = MagicMock()
    paper.id = paper_id
    paper.title = title
    paper.abstract = abstract
    paper.authors = kwargs.get("authors", [{"name": "Test Author"}])
    paper.journal = kwargs.get("journal", "Test Journal")
    paper.year = kwargs.get("year", 2024)
    paper.citation_count = kwargs.get("citation_count", 10)
    paper.doi = kwargs.get("doi", "10.1234/test")
    return paper


# ---------------------------------------------------------------------------
# Library Service Unit Tests
# ---------------------------------------------------------------------------


class TestLibraryServiceUnit:
    """Unit tests for LibraryService logic."""

    def test_health_identifies_missing_fields(self):
        """Verify health check identifies papers with missing metadata."""
        from app.services.library_service import LibraryService

        svc = LibraryService(AsyncMock())
        papers = [
            {
                "paper_id": 1,
                "title": "Complete Paper",
                "abstract": "Good abstract",
                "authors": [{"name": "A"}],
                "journal": "J",
                "year": 2024,
                "citation_count": 5,
                "doi": "10.1/1",
            },
            {
                "paper_id": 2,
                "title": "Incomplete Paper",
                "abstract": "",
                "authors": [],
                "journal": "",
                "year": None,
                "citation_count": 0,
                "doi": "",
            },
        ]
        result = svc.check_health(papers)
        assert result["total_papers"] == 2
        assert result["papers_with_issues"] == 1
        assert result["healthy_papers"] == 1
        assert len(result["issues"]) == 1
        assert result["issues"][0]["paper_id"] == 2

    def test_health_all_complete(self):
        """Verify health check returns zero issues when all papers are complete."""
        from app.services.library_service import LibraryService

        svc = LibraryService(AsyncMock())
        papers = [
            {
                "paper_id": 1,
                "title": "A",
                "abstract": "Abstract A",
                "authors": [{"name": "A"}],
                "journal": "J",
                "year": 2024,
                "citation_count": 5,
                "doi": "10.1/1",
            },
            {
                "paper_id": 2,
                "title": "B",
                "abstract": "Abstract B",
                "authors": [{"name": "B"}],
                "journal": "J",
                "year": 2023,
                "citation_count": 3,
                "doi": "10.1/2",
            },
        ]
        result = svc.check_health(papers)
        assert result["papers_with_issues"] == 0
        assert result["healthy_papers"] == 2
        assert result["issues"] == []

    def test_health_empty_library(self):
        """Verify health check handles empty paper list."""
        from app.services.library_service import LibraryService

        svc = LibraryService(AsyncMock())
        result = svc.check_health([])
        assert result["total_papers"] == 0
        assert result["papers_with_issues"] == 0

    @pytest.mark.asyncio
    async def test_repair_empty_list(self):
        """Verify repair handles empty paper list."""
        from app.services.library_service import LibraryService

        svc = LibraryService(AsyncMock())
        result = await svc.repair_metadata([])
        assert result["total_attempted"] == 0
        assert result["repaired"] == []
        assert result["failed"] == []

    @pytest.mark.asyncio
    async def test_repair_without_title_or_doi(self):
        """Verify repair fails gracefully when paper has no title or DOI."""
        from app.services.library_service import LibraryService

        svc = LibraryService(AsyncMock())
        result = await svc.repair_metadata([{"paper_id": 1, "title": "", "doi": ""}])
        assert result["failure_count"] == 1
        assert result["failed"][0]["reason"] == "no_title_or_doi"

    @pytest.mark.asyncio
    async def test_suggest_tags_empty(self):
        """Verify auto-tag returns empty for no papers."""
        from app.services.library_service import LibraryService

        mock_llm = AsyncMock()
        svc = LibraryService(mock_llm)
        result = await svc.suggest_tags([])
        assert result == []

    @pytest.mark.asyncio
    async def test_suggest_tags_returns_structured_data(self):
        """Verify auto-tag returns structured tag suggestions."""
        from app.services.library_service import LibraryService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "tags": [
                {"paper_id": 1, "suggested_tags": ["deep-learning", "microscopy"]},
            ]
        }
        svc = LibraryService(mock_llm)
        result = await svc.suggest_tags([{"paper_id": 1, "title": "DL Paper", "abstract": "About deep learning"}])
        assert len(result) == 1
        assert result[0]["paper_id"] == 1
        assert "deep-learning" in result[0]["suggested_tags"]

    @pytest.mark.asyncio
    async def test_cluster_empty(self):
        """Verify clustering returns empty for no papers."""
        from app.services.library_service import LibraryService

        mock_llm = AsyncMock()
        svc = LibraryService(mock_llm)
        result = await svc.cluster_papers([])
        assert result == []

    @pytest.mark.asyncio
    async def test_cluster_single_paper(self):
        """Verify clustering with single paper returns default cluster."""
        from app.services.library_service import LibraryService

        mock_llm = AsyncMock()
        svc = LibraryService(mock_llm)
        result = await svc.cluster_papers([{"paper_id": 1, "title": "Solo", "abstract": "Only paper"}])
        assert len(result) == 1
        assert result[0]["name"] == "General"
        assert result[0]["paper_ids"] == [1]

    @pytest.mark.asyncio
    async def test_cluster_returns_structured_data(self):
        """Verify clustering returns structured cluster data."""
        from app.services.library_service import LibraryService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "clusters": [
                {"name": "ML Methods", "description": "Machine learning papers", "paper_ids": [1, 2]},
                {"name": "Imaging", "description": "Imaging papers", "paper_ids": [3]},
            ]
        }
        svc = LibraryService(mock_llm)
        papers = [
            {"paper_id": 1, "title": "A", "abstract": "ML abstract"},
            {"paper_id": 2, "title": "B", "abstract": "ML abstract"},
            {"paper_id": 3, "title": "C", "abstract": "Imaging abstract"},
        ]
        result = await svc.cluster_papers(papers)
        assert len(result) == 2
        assert result[0]["name"] == "ML Methods"
        assert result[0]["paper_ids"] == [1, 2]


# ---------------------------------------------------------------------------
# API Endpoint Tests
# ---------------------------------------------------------------------------


class TestLibraryAPI:
    """Tests for /api/v1/projects/{project_id}/library endpoints."""

    @pytest.mark.asyncio
    async def test_health_empty_project(self, client: AsyncClient, project_id: int):
        """Verify health check on empty project returns zeroes."""
        resp = await client.get(f"/api/v1/projects/{project_id}/library/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["total_papers"] == 0
        assert body["data"]["papers_with_issues"] == 0

    @pytest.mark.asyncio
    async def test_health_returns_issues(self, client: AsyncClient, project_id: int):
        """Verify health check identifies papers with missing metadata."""
        from app.api.deps import get_db

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [
            _make_mock_paper(1, "Paper A", "Abstract A"),
            _make_mock_paper(2, "Incomplete", "", authors=[], journal="", year=None, citation_count=0, doi=""),
        ]

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.execute.return_value = mock_result
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            resp = await client.get(f"/api/v1/projects/{project_id}/library/health")
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total_papers"] == 2
        assert data["papers_with_issues"] == 1

    @pytest.mark.asyncio
    async def test_repair_no_papers_need_repair(self, client: AsyncClient, project_id: int):
        """Verify repair returns zeroes when all papers are complete."""
        from app.api.deps import get_db

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [
            _make_mock_paper(1, "Complete Paper", "Full abstract"),
        ]

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.execute.return_value = mock_result
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            resp = await client.post(f"/api/v1/projects/{project_id}/library/repair")
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total_attempted"] == 0
        assert data["repaired"] == []

    @pytest.mark.asyncio
    async def test_auto_tag_empty_project(self, client: AsyncClient, project_id: int):
        """Verify auto-tag on empty project returns zero tags."""
        resp = await client.post(f"/api/v1/projects/{project_id}/library/auto-tag")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["total_tagged"] == 0

    @pytest.mark.asyncio
    async def test_auto_tag_returns_structured_data(self, client: AsyncClient, project_id: int):
        """Verify auto-tag returns structured tag suggestions."""
        from app.api.deps import get_db

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [
            _make_mock_paper(1, "Paper A", "Abstract about deep learning"),
            _make_mock_paper(2, "Paper B", "Abstract about microscopy"),
        ]

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.execute.return_value = mock_result
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            with patch(
                "app.services.library_service.LibraryService.suggest_tags",
                new_callable=AsyncMock,
                return_value=[
                    {"paper_id": 1, "suggested_tags": ["deep-learning", "neural-networks"]},
                    {"paper_id": 2, "suggested_tags": ["microscopy", "imaging"]},
                ],
            ):
                resp = await client.post(f"/api/v1/projects/{project_id}/library/auto-tag")
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total_tagged"] == 2
        assert len(data["tags"]) == 2
        assert "deep-learning" in data["tags"][0]["suggested_tags"]

    @pytest.mark.asyncio
    async def test_cluster_empty_project(self, client: AsyncClient, project_id: int):
        """Verify clustering on empty project returns zero clusters."""
        resp = await client.post(f"/api/v1/projects/{project_id}/library/clusters")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["total_clusters"] == 0

    @pytest.mark.asyncio
    async def test_cluster_returns_structured_data(self, client: AsyncClient, project_id: int):
        """Verify clustering returns structured cluster data."""
        from app.api.deps import get_db

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [
            _make_mock_paper(1, "ML Paper", "Abstract about machine learning"),
            _make_mock_paper(2, "ML Paper 2", "Abstract about deep learning"),
            _make_mock_paper(3, "Imaging Paper", "Abstract about microscopy"),
        ]

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.execute.return_value = mock_result
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            with patch(
                "app.services.library_service.LibraryService.cluster_papers",
                new_callable=AsyncMock,
                return_value=[
                    {"name": "ML Methods", "description": "Machine learning papers", "paper_ids": [1, 2]},
                    {"name": "Imaging", "description": "Imaging papers", "paper_ids": [3]},
                ],
            ):
                resp = await client.post(f"/api/v1/projects/{project_id}/library/clusters")
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total_clusters"] == 2
        assert data["clusters"][0]["name"] == "ML Methods"
        assert data["clusters"][0]["paper_ids"] == [1, 2]
