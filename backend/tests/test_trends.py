"""Tests for TrendService and trend analysis API endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, async_session_factory, engine
from app.main import app
from app.models import Paper, Project


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
async def project_with_papers():
    async with async_session_factory() as session:
        project = Project(name="Trend Test Project", domain="AI")
        session.add(project)
        await session.flush()

        papers = [
            Paper(
                project_id=project.id,
                title="Deep Learning in Neural Networks",
                doi="10.1234/dl1",
                source_id="s2:dl1",
                tags=["deep learning", "neural networks"],
                year=2020,
                citation_count=100,
            ),
            Paper(
                project_id=project.id,
                title="Transformer Models for NLP",
                doi="10.1234/tf1",
                source_id="s2:tf1",
                tags=["transformers", "deep learning"],
                year=2021,
                citation_count=200,
            ),
            Paper(
                project_id=project.id,
                title="Advances in Transformer Architecture",
                doi="10.1234/tf2",
                source_id="s2:tf2",
                tags=["transformers", "deep learning"],
                year=2022,
                citation_count=150,
            ),
            Paper(
                project_id=project.id,
                title="Reinforcement Learning Survey",
                doi="10.1234/rl1",
                source_id="s2:rl1",
                tags=["reinforcement learning"],
                year=2020,
                citation_count=50,
            ),
        ]
        for p in papers:
            session.add(p)
        await session.commit()
        return {"project_id": project.id}


class TestTrendService:
    """Unit tests for TrendService."""

    async def test_compute_trends_returns_timeline(self, project_with_papers):
        from app.services.trend_service import TrendService

        info = project_with_papers

        async with async_session_factory() as session:
            svc = TrendService(session)
            result = await svc.compute_trends(info["project_id"])

        assert "publication_timeline" in result
        assert "topic_trends" in result
        assert "emerging_topics" in result
        assert "declining_topics" in result
        assert "summary_stats" in result
        assert result["summary_stats"]["total_papers"] == 4

    async def test_empty_project_returns_empty_result(self):
        from app.services.trend_service import TrendService

        async with async_session_factory() as session:
            project = Project(name="Empty Project", domain="AI")
            session.add(project)
            await session.commit()
            project_id = project.id

        async with async_session_factory() as session:
            svc = TrendService(session)
            result = await svc.compute_trends(project_id)

        assert result["publication_timeline"] == []
        assert result["topic_trends"] == []
        assert result["summary_stats"]["total_papers"] == 0

    async def test_papers_without_year_are_skipped(self):
        from app.services.trend_service import TrendService

        async with async_session_factory() as session:
            project = Project(name="No Year Project", domain="AI")
            session.add(project)
            await session.flush()
            paper = Paper(
                project_id=project.id,
                title="Paper Without Year",
                doi="10.1234/noyear",
                source_id="s2:noyear",
                tags=["test"],
                year=None,
            )
            session.add(paper)
            await session.commit()
            project_id = project.id

        async with async_session_factory() as session:
            svc = TrendService(session)
            result = await svc.compute_trends(project_id)

        assert result["publication_timeline"] == []

    async def test_topic_extraction_from_tags(self, project_with_papers):
        from app.services.trend_service import TrendService

        info = project_with_papers

        async with async_session_factory() as session:
            svc = TrendService(session)
            result = await svc.compute_trends(info["project_id"])

        # Should have topics from tags
        assert len(result["topic_trends"]) > 0
        topics = {t["topic"] for t in result["topic_trends"]}
        assert "deep learning" in topics

    async def test_topic_extraction_from_metadata(self):
        from app.services.trend_service import TrendService

        async with async_session_factory() as session:
            project = Project(name="Metadata Topics", domain="AI")
            session.add(project)
            await session.flush()
            paper = Paper(
                project_id=project.id,
                title="Test Paper",
                doi="10.1234/meta",
                source_id="s2:meta",
                year=2023,
                extra_metadata={"keywords": "machine learning, computer vision"},
            )
            session.add(paper)
            await session.commit()
            project_id = project.id

        async with async_session_factory() as session:
            svc = TrendService(session)
            result = await svc.compute_trends(project_id)

        topics = {t["topic"] for t in result["topic_trends"]}
        assert "machine learning" in topics


class TestTrendAPI:
    """API endpoint tests for trend analysis."""

    @pytest.mark.asyncio
    async def test_trend_endpoint(self, client: AsyncClient, project_with_papers):
        info = project_with_papers

        resp = await client.get(f"/api/v1/projects/{info['project_id']}/analysis/trends")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "publication_timeline" in data
        assert "topic_trends" in data
        assert "summary_stats" in data

    @pytest.mark.asyncio
    async def test_trend_endpoint_empty_project(self, client: AsyncClient):
        # Create an empty project first
        from app.database import async_session_factory
        from app.models import Project

        async with async_session_factory() as session:
            project = Project(name="Empty API Test", domain="AI")
            session.add(project)
            await session.commit()
            project_id = project.id

        resp = await client.get(f"/api/v1/projects/{project_id}/analysis/trends")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["publication_timeline"] == []

    @pytest.mark.asyncio
    async def test_trend_project_not_found(self, client: AsyncClient):
        resp = await client.get("/api/v1/projects/99999/analysis/trends")
        assert resp.status_code in (404, 500)
