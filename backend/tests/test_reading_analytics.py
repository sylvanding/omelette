"""Tests for reading analytics endpoints and service."""

from datetime import datetime, timedelta

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


# ---------------------------------------------------------------------------
# Reading Session API Tests
# ---------------------------------------------------------------------------


class TestReadingSessionAPI:
    """API tests for reading session recording."""

    async def test_record_session_creates_record(self, client: AsyncClient, project_id: int):
        """POST a reading session and verify 201 with correct data."""
        paper_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Test Paper", "doi": "10.1/test"},
        )
        assert paper_resp.status_code == 201
        paper_id = paper_resp.json()["data"]["id"]

        started = datetime.now() - timedelta(minutes=15)
        ended = datetime.now()

        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers/reading-sessions",
            json={
                "paper_id": paper_id,
                "started_at": started.isoformat(),
                "ended_at": ended.isoformat(),
                "time_spent_seconds": 900,
                "pages_read": 5,
            },
        )
        assert resp.status_code == 201
        data = resp.json()["data"]
        assert data["paper_id"] == paper_id
        assert data["time_spent_seconds"] == 900
        assert data["pages_read"] == 5

    async def test_record_session_updates_paper_status(self, client: AsyncClient, project_id: int):
        """Verify paper transitions from unread to reading on session record."""
        paper_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Unread Paper", "doi": "10.2/test"},
        )
        paper_id = paper_resp.json()["data"]["id"]

        started = datetime.now() - timedelta(minutes=10)
        ended = datetime.now()

        await client.post(
            f"/api/v1/projects/{project_id}/papers/reading-sessions",
            json={
                "paper_id": paper_id,
                "started_at": started.isoformat(),
                "ended_at": ended.isoformat(),
                "time_spent_seconds": 600,
            },
        )

        paper_get = await client.get(f"/api/v1/projects/{project_id}/papers/{paper_id}")
        paper_data = paper_get.json()["data"]
        assert paper_data["reading_status"] == "reading"

    async def test_record_session_validation(self, client: AsyncClient, project_id: int):
        """Reject negative time_spent_seconds."""
        paper_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Validation Paper", "doi": "10.3/test"},
        )
        paper_id = paper_resp.json()["data"]["id"]

        started = datetime.now() - timedelta(minutes=5)
        ended = datetime.now()

        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers/reading-sessions",
            json={
                "paper_id": paper_id,
                "started_at": started.isoformat(),
                "ended_at": ended.isoformat(),
                "time_spent_seconds": -10,
            },
        )
        assert resp.status_code == 400

    async def test_record_session_paper_not_in_project(self, client: AsyncClient, project_id: int):
        """Reject session for paper not in this project."""
        other_proj = await client.post("/api/v1/projects", json={"name": "Other Project"})
        other_proj_id = other_proj.json()["data"]["id"]

        paper_resp = await client.post(
            f"/api/v1/projects/{other_proj_id}/papers",
            json={"title": "Other Paper", "doi": "10.4/test"},
        )
        other_paper_id = paper_resp.json()["data"]["id"]

        started = datetime.now() - timedelta(minutes=5)
        ended = datetime.now()

        resp = await client.post(
            f"/api/v1/projects/{project_id}/papers/reading-sessions",
            json={
                "paper_id": other_paper_id,
                "started_at": started.isoformat(),
                "ended_at": ended.isoformat(),
                "time_spent_seconds": 300,
            },
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Enhanced Analytics API Tests
# ---------------------------------------------------------------------------


class TestEnhancedAnalyticsAPI:
    """API tests for enhanced analytics endpoint."""

    async def test_analytics_returns_all_metrics(self, client: AsyncClient, project_id: int):
        """Verify response includes all new analytics fields."""
        resp = await client.get(f"/api/v1/projects/{project_id}/papers/analytics")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "papers_per_week" in data
        assert "avg_read_time_seconds" in data
        assert "reading_streak_days" in data
        assert "domain_coverage" in data
        assert "citation_impact" in data
        assert "total" in data
        assert "by_status" in data
        assert "read_by_week" in data
        assert "top_journals" in data

    async def test_analytics_zero_sessions(self, client: AsyncClient, project_id: int):
        """Verify graceful defaults when no reading sessions exist."""
        resp = await client.get(f"/api/v1/projects/{project_id}/papers/analytics")
        data = resp.json()["data"]
        assert data["avg_read_time_seconds"] == 0.0
        assert data["reading_streak_days"] == 0
        assert data["papers_per_week"] == 0.0

    async def test_analytics_papers_per_week(self, client: AsyncClient, project_id: int):
        """Verify papers_per_week computes correctly across weeks."""
        now = datetime.now()
        papers = []
        for i in range(6):
            paper_resp = await client.post(
                f"/api/v1/projects/{project_id}/papers",
                json={"title": f"Week Paper {i}", "doi": f"10.{i}/test"},
            )
            paper_id = paper_resp.json()["data"]["id"]
            read_at = (now - timedelta(weeks=i)).isoformat()
            await client.put(
                f"/api/v1/projects/{project_id}/papers/{paper_id}",
                json={"reading_status": "read"},
            )
            papers.append(paper_id)

        from sqlalchemy import update

        from app.api.deps import get_db
        from app.models.paper import Paper

        async for db in get_db():
            for i, pid in enumerate(papers):
                read_at = now - timedelta(weeks=i)
                stmt = update(Paper).where(Paper.id == pid).values(reading_status="read", read_at=read_at)
                await db.execute(stmt)
            await db.commit()
            break

        resp = await client.get(f"/api/v1/projects/{project_id}/papers/analytics")
        data = resp.json()["data"]
        assert data["papers_per_week"] > 0

    async def test_analytics_citation_impact(self, client: AsyncClient, project_id: int):
        """Verify citation impact stats are computed."""
        for i in range(5):
            await client.post(
                f"/api/v1/projects/{project_id}/papers",
                json={"title": f"Cite Paper {i}", "doi": f"10.{i + 20}/test", "citation_count": (i + 1) * 10},
            )

        resp = await client.get(f"/api/v1/projects/{project_id}/papers/analytics")
        data = resp.json()["data"]
        ci = data["citation_impact"]
        assert ci["min"] == 10
        assert ci["max"] == 50
        assert ci["mean"] == 30.0


# ---------------------------------------------------------------------------
# Knowledge Gap API Tests
# ---------------------------------------------------------------------------


class TestKnowledgeGapAPI:
    """API tests for knowledge gap analysis."""

    async def test_knowledge_gaps_empty_project(self, client: AsyncClient, project_id: int):
        """Empty project returns zero coverage."""
        resp = await client.get(f"/api/v1/projects/{project_id}/analytics/knowledge-gaps")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["coverage_score"] == 0.0
        assert data["total_topics_analyzed"] == 0

    async def test_knowledge_gaps_with_papers(self, client: AsyncClient, project_id: int):
        """Project with diverse journals returns gap analysis."""
        journals = ["Nature", "Science", "Cell", "PLOS One", "IEEE"]
        for i, j in enumerate(journals):
            await client.post(
                f"/api/v1/projects/{project_id}/papers",
                json={"title": f"Gap Paper {i}", "doi": f"10.{i + 30}/test", "journal": j},
            )

        resp = await client.get(f"/api/v1/projects/{project_id}/analytics/knowledge-gaps")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total_topics_analyzed"] == 5
        assert data["coverage_score"] > 0


# ---------------------------------------------------------------------------
# Analytics Service Unit Tests
# ---------------------------------------------------------------------------


class TestAnalyticsServiceUnit:
    """Unit tests for AnalyticsService methods."""

    def test_percentile_empty_list(self):
        """Percentile of empty list returns 0."""
        from app.services.analytics_service import AnalyticsService

        assert AnalyticsService._percentile([], 50) == 0.0

    def test_percentile_single_value(self):
        """Percentile of single value returns that value."""
        from app.services.analytics_service import AnalyticsService

        assert AnalyticsService._percentile([42], 50) == 42.0
        assert AnalyticsService._percentile([42], 75) == 42.0

    def test_percentile_median(self):
        """Median of odd-length list is middle value."""
        from app.services.analytics_service import AnalyticsService

        values = [1, 2, 3, 4, 5]
        assert AnalyticsService._percentile(values, 50) == 3.0

    def test_percentile_p75(self):
        """P75 of 4 values."""
        from app.services.analytics_service import AnalyticsService

        values = [10, 20, 30, 40]
        p75 = AnalyticsService._percentile(values, 75)
        assert p75 == 32.5
