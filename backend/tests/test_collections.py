"""Tests for collections CRUD endpoints and smart tagging."""

from unittest.mock import AsyncMock

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
# Collection Service Unit Tests
# ---------------------------------------------------------------------------


class TestCollectionServiceUnit:
    """Unit tests for CollectionService logic."""

    @pytest.mark.asyncio
    async def test_empty_papers_returns_empty(self):
        """Verify that zero papers returns empty tag suggestions."""
        from app.services.collection_service import CollectionService

        svc = CollectionService(AsyncMock())
        result = await svc.suggest_tags([])
        assert result["tags"] == []

    @pytest.mark.asyncio
    async def test_suggests_tags_for_papers(self):
        """Verify the service returns tags for given papers."""
        from app.services.collection_service import CollectionService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "tags": [
                {"paper_id": 1, "suggested_tags": ["deep learning", "microscopy"]},
                {"paper_id": 2, "suggested_tags": ["evaluation", "artifacts"]},
            ]
        }
        svc = CollectionService(mock_llm)
        result = await svc.suggest_tags(
            [
                {"paper_id": 1, "title": "Paper A", "abstract": "Abstract A"},
                {"paper_id": 2, "title": "Paper B", "abstract": "Abstract B"},
            ]
        )
        assert len(result["tags"]) == 2
        assert result["tags"][0]["paper_id"] == 1
        assert "deep learning" in result["tags"][0]["suggested_tags"]

    @pytest.mark.asyncio
    async def test_handles_llm_failure_gracefully(self):
        """Verify that LLM failures return empty results without raising."""
        from app.services.collection_service import CollectionService

        mock_llm = AsyncMock()
        mock_llm.chat_json.side_effect = Exception("LLM error")
        svc = CollectionService(mock_llm)
        result = await svc.suggest_tags([{"paper_id": 1, "title": "A", "abstract": ""}])
        assert result["tags"] == []

    @pytest.mark.asyncio
    async def test_limits_to_20_papers(self):
        """Verify the service truncates to 20 papers max."""
        from app.services.collection_service import CollectionService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {"tags": []}
        svc = CollectionService(mock_llm)
        papers = [{"paper_id": i, "title": f"Paper {i}", "abstract": f"Abstract {i}"} for i in range(30)]
        await svc.suggest_tags(papers)
        messages = mock_llm.chat_json.call_args[0][0]
        user_content = messages[1]["content"]
        # Should only contain 20 papers
        assert user_content.count("Paper ID:") == 20


# ---------------------------------------------------------------------------
# Collection API Endpoint Tests
# ---------------------------------------------------------------------------


class TestCollectionAPI:
    """Tests for /api/v1/projects/{project_id}/collections endpoints."""

    @pytest.mark.asyncio
    async def test_create_collection(self, client: AsyncClient, project_id: int):
        """Verify collection creation returns 201."""
        resp = await client.post(
            f"/api/v1/projects/{project_id}/collections",
            json={"name": "Methods", "description": "Methodology papers", "color": "#3b82f6"},
        )
        assert resp.status_code == 201
        data = resp.json()["data"]
        assert data["name"] == "Methods"
        assert data["paper_count"] == 0

    @pytest.mark.asyncio
    async def test_list_collections_empty(self, client: AsyncClient, project_id: int):
        """Verify empty list returns zero collections."""
        resp = await client.get(f"/api/v1/projects/{project_id}/collections")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["collections"] == []

    @pytest.mark.asyncio
    async def test_list_collections_after_create(self, client: AsyncClient, project_id: int):
        """Verify list returns created collections."""
        await client.post(
            f"/api/v1/projects/{project_id}/collections",
            json={"name": "Methods"},
        )
        await client.post(
            f"/api/v1/projects/{project_id}/collections",
            json={"name": "Results", "color": "#10b981"},
        )
        resp = await client.get(f"/api/v1/projects/{project_id}/collections")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["collections"]) == 2
        names = {c["name"] for c in data["collections"]}
        assert "Methods" in names
        assert "Results" in names

    @pytest.mark.asyncio
    async def test_update_collection(self, client: AsyncClient, project_id: int):
        """Verify collection update works."""
        create_resp = await client.post(
            f"/api/v1/projects/{project_id}/collections",
            json={"name": "Old Name"},
        )
        coll_id = create_resp.json()["data"]["id"]

        update_resp = await client.put(
            f"/api/v1/projects/{project_id}/collections/{coll_id}",
            json={"name": "New Name", "description": "Updated"},
        )
        assert update_resp.status_code == 200
        data = update_resp.json()["data"]
        assert data["name"] == "New Name"
        assert data["description"] == "Updated"

    @pytest.mark.asyncio
    async def test_delete_collection(self, client: AsyncClient, project_id: int):
        """Verify collection deletion works."""
        create_resp = await client.post(
            f"/api/v1/projects/{project_id}/collections",
            json={"name": "To Delete"},
        )
        coll_id = create_resp.json()["data"]["id"]

        delete_resp = await client.delete(
            f"/api/v1/projects/{project_id}/collections/{coll_id}",
        )
        assert delete_resp.status_code == 200

        list_resp = await client.get(f"/api/v1/projects/{project_id}/collections")
        assert len(list_resp.json()["data"]["collections"]) == 0

    @pytest.mark.asyncio
    async def test_get_collection_with_papers(self, client: AsyncClient, project_id: int):
        """Verify getting a collection returns its papers."""
        # Create collection
        create_resp = await client.post(
            f"/api/v1/projects/{project_id}/collections",
            json={"name": "Test Collection"},
        )
        coll_id = create_resp.json()["data"]["id"]

        # Create a paper
        paper_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Test Paper", "abstract": "An abstract"},
        )
        paper_id = paper_resp.json()["data"]["id"]

        # Add paper to collection
        await client.post(
            f"/api/v1/projects/{project_id}/collections/{coll_id}/papers",
            json={"paper_ids": [paper_id]},
        )

        # Get collection detail
        resp = await client.get(f"/api/v1/projects/{project_id}/collections/{coll_id}")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["collection"]["name"] == "Test Collection"
        assert len(data["papers"]) == 1
        assert data["papers"][0]["paper_id"] == paper_id

    @pytest.mark.asyncio
    async def test_add_papers_to_collection(self, client: AsyncClient, project_id: int):
        """Verify adding papers increases paper count."""
        create_resp = await client.post(
            f"/api/v1/projects/{project_id}/collections",
            json={"name": "Collection"},
        )
        coll_id = create_resp.json()["data"]["id"]

        paper1 = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Paper 1"},
        )
        paper2 = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Paper 2"},
        )
        pid1 = paper1.json()["data"]["id"]
        pid2 = paper2.json()["data"]["id"]

        add_resp = await client.post(
            f"/api/v1/projects/{project_id}/collections/{coll_id}/papers",
            json={"paper_ids": [pid1, pid2]},
        )
        assert add_resp.status_code == 200
        assert add_resp.json()["data"]["paper_count"] == 2

    @pytest.mark.asyncio
    async def test_remove_papers_from_collection(self, client: AsyncClient, project_id: int):
        """Verify removing papers decreases paper count."""
        create_resp = await client.post(
            f"/api/v1/projects/{project_id}/collections",
            json={"name": "Collection"},
        )
        coll_id = create_resp.json()["data"]["id"]

        paper_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Paper"},
        )
        pid = paper_resp.json()["data"]["id"]

        await client.post(
            f"/api/v1/projects/{project_id}/collections/{coll_id}/papers",
            json={"paper_ids": [pid]},
        )

        import json as _json

        remove_resp = await client.request(
            "DELETE",
            f"/api/v1/projects/{project_id}/collections/{coll_id}/papers",
            content=_json.dumps({"paper_ids": [pid]}),
            headers={"Content-Type": "application/json"},
        )
        assert remove_resp.status_code == 200
        assert remove_resp.json()["data"]["paper_count"] == 0

    @pytest.mark.asyncio
    async def test_collection_not_found(self, client: AsyncClient, project_id: int):
        """Verify 404 for non-existent collection."""
        resp = await client.put(
            f"/api/v1/projects/{project_id}/collections/99999",
            json={"name": "Nope"},
        )
        assert resp.status_code == 404


class TestSmartTaggingAPI:
    """Tests for /api/v1/projects/{project_id}/collections/tags/suggest endpoint."""

    @pytest.mark.asyncio
    async def test_suggest_tags_returns_tags(self, client: AsyncClient, project_id: int):
        """Verify smart tagging returns tag suggestions."""
        # Create papers
        p1 = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Deep Learning for Microscopy", "abstract": "A deep learning approach to super-resolution"},
        )
        p2 = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Limitations of AI", "abstract": "AI methods introduce artifacts"},
        )
        pid1 = p1.json()["data"]["id"]
        pid2 = p2.json()["data"]["id"]

        resp = await client.post(
            f"/api/v1/projects/{project_id}/collections/tags/suggest",
            json={"paper_ids": [pid1, pid2]},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["tags"]) >= 1
        # Check that at least one tag entry has paper_id and suggested_tags
        first_tag = data["tags"][0]
        assert "paper_id" in first_tag
        assert "suggested_tags" in first_tag

    @pytest.mark.asyncio
    async def test_suggest_tags_empty_papers(self, client: AsyncClient, project_id: int):
        """Verify smart tagging with no papers returns empty."""
        resp = await client.post(
            f"/api/v1/projects/{project_id}/collections/tags/suggest",
            json={"paper_ids": []},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["tags"] == []


class TestCollectionPaperFilter:
    """Tests for collection_id filter on papers list."""

    @pytest.mark.asyncio
    async def test_filter_by_collection(self, client: AsyncClient, project_id: int):
        """Verify papers list can be filtered by collection_id."""
        # Create collection
        coll_resp = await client.post(
            f"/api/v1/projects/{project_id}/collections",
            json={"name": "Filtered"},
        )
        coll_id = coll_resp.json()["data"]["id"]

        # Create papers
        p1 = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "In Collection"},
        )
        p2 = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Not In Collection"},
        )
        pid1 = p1.json()["data"]["id"]
        _pid2 = p2.json()["data"]["id"]  # noqa: F841 - paper exists but should be excluded from filter

        # Add only paper 1 to collection
        await client.post(
            f"/api/v1/projects/{project_id}/collections/{coll_id}/papers",
            json={"paper_ids": [pid1]},
        )

        # Filter by collection
        resp = await client.get(
            f"/api/v1/projects/{project_id}/papers",
            params={"collection_id": coll_id},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] == 1
        assert data["items"][0]["title"] == "In Collection"

    @pytest.mark.asyncio
    async def test_list_all_papers_without_filter(self, client: AsyncClient, project_id: int):
        """Verify papers list returns all papers without collection filter."""
        await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Paper A"},
        )
        await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Paper B"},
        )

        resp = await client.get(f"/api/v1/projects/{project_id}/papers")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] == 2
