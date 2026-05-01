"""Tests for personalized research feed endpoints and service."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_db
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
# Feed Service Unit Tests
# ---------------------------------------------------------------------------


class TestFeedServiceUnit:
    """Unit tests for FeedService logic."""

    @pytest.mark.asyncio
    async def test_get_feed_returns_recommendations(self):
        """Verify feed returns structured recommendations."""
        from app.services.feed_service import FeedService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "recommendations": [
                {
                    "title": "Test Paper",
                    "authors": "A. Author",
                    "year": 2024,
                    "abstract": "Test abstract",
                    "doi": "10.1/1",
                    "relevance_score": 0.85,
                    "reason": "Matches your interests",
                }
            ]
        }

        svc = FeedService(mock_llm)
        result = await svc.get_feed(
            papers=[{"paper_id": 1, "title": "Existing", "abstract": "Abstract"}],
            reading_history=[{"title": "Read Paper", "read_time_seconds": 300}],
            liked_paper_ids=[1],
            keywords=["microscopy"],
            recent_activity=[],
        )

        assert len(result) == 1
        assert result[0]["title"] == "Test Paper"
        assert result[0]["relevance_score"] == 0.85

    @pytest.mark.asyncio
    async def test_get_feed_empty_profile_returns_empty(self):
        """Verify feed returns empty when no profile data exists."""
        from app.services.feed_service import FeedService

        svc = FeedService(AsyncMock())
        result = await svc.get_feed(
            papers=[],
            reading_history=[],
            liked_paper_ids=[],
            keywords=[],
            recent_activity=[],
        )
        assert result == []

    @pytest.mark.asyncio
    async def test_get_feed_clamps_score_bounds(self):
        """Verify relevance scores are clamped to [0, 1]."""
        from app.services.feed_service import FeedService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "recommendations": [
                {
                    "title": "High Score",
                    "relevance_score": 1.5,
                    "reason": "test",
                },
                {
                    "title": "Low Score",
                    "relevance_score": -0.3,
                    "reason": "test",
                },
            ]
        }

        svc = FeedService(mock_llm)
        result = await svc.get_feed(
            papers=[{"paper_id": 1, "title": "P", "abstract": "A"}],
            reading_history=[],
            liked_paper_ids=[],
            keywords=[],
            recent_activity=[],
        )

        assert result[0]["relevance_score"] == 1.0
        assert result[1]["relevance_score"] == 0.0

    @pytest.mark.asyncio
    async def test_get_feed_handles_llm_error(self):
        """Verify feed returns empty list on LLM failure."""
        from app.services.feed_service import FeedService

        mock_llm = AsyncMock()
        mock_llm.chat_json.side_effect = Exception("LLM error")

        svc = FeedService(mock_llm)
        result = await svc.get_feed(
            papers=[{"paper_id": 1, "title": "P", "abstract": "A"}],
            reading_history=[],
            liked_paper_ids=[],
            keywords=[],
            recent_activity=[],
        )
        assert result == []

    def test_submit_feedback_like_increases_score(self):
        """Verify like feedback increases score."""
        from app.services.feed_service import FeedService

        svc = FeedService(AsyncMock())
        result = svc.submit_feedback(paper_id=1, feedback="like", previous_score=0.5)
        import asyncio

        if hasattr(result, "__await__"):
            result = asyncio.get_event_loop().run_until_complete(result)
        assert result["adjusted_score"] == 0.6
        assert result["acknowledged"] is True

    def test_submit_feedback_dislike_decreases_score(self):
        """Verify dislike feedback decreases score."""
        from app.services.feed_service import FeedService

        svc = FeedService(AsyncMock())
        result = svc.submit_feedback(paper_id=1, feedback="dislike", previous_score=0.5)
        import asyncio

        if hasattr(result, "__await__"):
            result = asyncio.get_event_loop().run_until_complete(result)
        assert result["adjusted_score"] == 0.4


# ---------------------------------------------------------------------------
# API Endpoint Tests
# ---------------------------------------------------------------------------


class TestFeedAPI:
    """Tests for feed API endpoints."""

    @pytest.mark.asyncio
    async def test_get_feed_returns_recommendations(self, client: AsyncClient, project_id: int):
        """Verify feed endpoint returns structured recommendations."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.get.return_value = MagicMock(id=project_id)
            mock_session.execute.return_value = mock_result
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            resp = await client.get(f"/api/v1/projects/{project_id}/feed/recommendations")
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 200
        data = resp.json()
        assert data["code"] == 200
        assert "recommendations" in data["data"]

    @pytest.mark.asyncio
    async def test_get_feed_returns_404_for_unknown_project(self, client: AsyncClient):
        """Verify feed returns 404 for non-existent project."""

        mock_project_result = MagicMock()
        mock_project_result.scalars.return_value.first.return_value = None

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.execute = AsyncMock(return_value=mock_project_result)
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            resp = await client.get("/api/v1/projects/99999/feed/recommendations")
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_refresh_feed_recalculates(self, client: AsyncClient, project_id: int):
        """Verify refresh endpoint forces recalculation."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.get.return_value = MagicMock(id=project_id)
            mock_session.execute.return_value = mock_result
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            resp = await client.post(f"/api/v1/projects/{project_id}/feed/refresh")
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "feed refreshed"

    @pytest.mark.asyncio
    async def test_feedback_like_accepted(self, client: AsyncClient, project_id: int):
        """Verify like feedback is accepted."""

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.get.return_value = MagicMock(id=project_id)
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            resp = await client.post(
                f"/api/v1/projects/{project_id}/feed/42/feedback",
                json={"feedback": "like"},
            )
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 200
        data = resp.json()
        assert data["acknowledged"] is True
        assert data["paper_id"] == 42

    @pytest.mark.asyncio
    async def test_feedback_dislike_accepted(self, client: AsyncClient, project_id: int):
        """Verify dislike feedback is accepted."""

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.get.return_value = MagicMock(id=project_id)
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            resp = await client.post(
                f"/api/v1/projects/{project_id}/feed/99/feedback",
                json={"feedback": "dislike"},
            )
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 200
        data = resp.json()
        assert data["paper_id"] == 99

    @pytest.mark.asyncio
    async def test_feedback_invalid_rejected(self, client: AsyncClient, project_id: int):
        """Verify invalid feedback values are rejected."""

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.get.return_value = MagicMock(id=project_id)
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            resp = await client.post(
                f"/api/v1/projects/{project_id}/feed/1/feedback",
                json={"feedback": "maybe"},
            )
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_feed_empty_library_returns_empty(self, client: AsyncClient, project_id: int):
        """Verify feed handles empty library gracefully."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.get.return_value = MagicMock(id=project_id)
            mock_session.execute.return_value = mock_result
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            resp = await client.get(f"/api/v1/projects/{project_id}/feed/recommendations")
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 200
        data = resp.json()
        assert data["data"]["total"] == 0
