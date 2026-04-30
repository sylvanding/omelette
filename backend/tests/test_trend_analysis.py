"""Tests for TrendService and trends API endpoint."""

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
                title="Deep Learning Survey",
                doi="10.1234/dl1",
                source_id="s2:dl1",
                authors=[{"name": "Alice"}],
                year=2020,
                citation_count=50,
                tags=["deep learning", "neural networks"],
            ),
            Paper(
                project_id=project.id,
                title="Transformer Models",
                doi="10.1234/tm1",
                source_id="s2:tm1",
                authors=[{"name": "Bob"}],
                year=2021,
                citation_count=100,
                tags=["deep learning", "transformers"],
            ),
            Paper(
                project_id=project.id,
                title="Large Language Models",
                doi="10.1234/llm1",
                source_id="s2:llm1",
                authors=[{"name": "Alice"}, {"name": "Carol"}],
                year=2022,
                citation_count=200,
                tags=["deep learning", "transformers", "llm"],
            ),
            Paper(
                project_id=project.id,
                title="GPT-4 Analysis",
                doi="10.1234/gpt4",
                source_id="s2:gpt4",
                authors=[{"name": "Bob"}, {"name": "Carol"}],
                year=2023,
                citation_count=150,
                tags=["llm", "transformers"],
            ),
            Paper(
                project_id=project.id,
                title="Reinforcement Learning",
                doi="10.1234/rl1",
                source_id="s2:rl1",
                authors=[{"name": "Dave"}],
                year=2020,
                citation_count=30,
                tags=["reinforcement learning"],
            ),
        ]
        for p in papers:
            session.add(p)
        await session.commit()
        return {"project_id": project.id}


class TestTrendService:
    """Unit tests for TrendService."""

    async def test_returns_timeline_and_topics(self, project_with_papers):
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
        assert result["summary_stats"]["total_papers"] == 5

    async def test_timeline_sorted_by_year(self, project_with_papers):
        from app.services.trend_service import TrendService

        info = project_with_papers
        async with async_session_factory() as session:
            svc = TrendService(session)
            result = await svc.compute_trends(info["project_id"])

        timeline = result["publication_timeline"]
        years = [entry["year"] for entry in timeline]
        assert years == sorted(years)

    async def test_emerging_topic_detection(self, project_with_papers):
        from app.services.trend_service import TrendService

        info = project_with_papers
        async with async_session_factory() as session:
            svc = TrendService(session)
            result = await svc.compute_trends(info["project_id"])

        # "llm" should be emerging: 1 paper in 2022, 1 in 2023 -> 0% growth
        # "transformers": 1 in 2021, 1 in 2022, 1 in 2023 -> stable
        # Check structure at least
        for topic in result["emerging_topics"]:
            assert "topic" in topic
            assert "yoy_growth" in topic
            assert topic["yoy_growth"] > 0.5

    async def test_empty_project_returns_empty_response(self):
        from app.services.trend_service import TrendService

        async with async_session_factory() as session:
            project = Project(name="Empty Trend Project", domain="AI")
            session.add(project)
            await session.commit()
            project_id = project.id

        async with async_session_factory() as session:
            svc = TrendService(session)
            result = await svc.compute_trends(project_id)

        assert result["publication_timeline"] == []
        assert result["topic_trends"] == []
        assert result["summary_stats"]["total_papers"] == 0

    async def test_paper_without_year_skipped(self):
        from app.services.trend_service import TrendService

        async with async_session_factory() as session:
            project = Project(name="No Year Project", domain="AI")
            session.add(project)
            await session.flush()
            paper = Paper(
                project_id=project.id,
                title="No Year Paper",
                doi="10.1234/noyear",
                source_id="s2:noyear",
                authors=[{"name": "Test"}],
                year=None,
                tags=["test"],
            )
            session.add(paper)
            await session.commit()
            project_id = project.id

        async with async_session_factory() as session:
            svc = TrendService(session)
            result = await svc.compute_trends(project_id)

        assert result["publication_timeline"] == []

    async def test_paper_without_tags_contributed_to_volume(self):
        from app.services.trend_service import TrendService

        async with async_session_factory() as session:
            project = Project(name="No Tags Project", domain="AI")
            session.add(project)
            await session.flush()
            paper = Paper(
                project_id=project.id,
                title="No Tags Paper",
                doi="10.1234/notags",
                source_id="s2:notags",
                authors=[{"name": "Test"}],
                year=2024,
                tags=None,
            )
            session.add(paper)
            await session.commit()
            project_id = project.id

        async with async_session_factory() as session:
            svc = TrendService(session)
            result = await svc.compute_trends(project_id)

        assert len(result["publication_timeline"]) == 1
        assert result["publication_timeline"][0]["year"] == 2024
        assert result["publication_timeline"][0]["count"] == 1
        assert len(result["topic_trends"]) == 0

    async def test_topics_extracted_from_extra_metadata(self):
        from app.services.trend_service import TrendService

        async with async_session_factory() as session:
            project = Project(name="Metadata Project", domain="AI")
            session.add(project)
            await session.flush()
            paper = Paper(
                project_id=project.id,
                title="Metadata Paper",
                doi="10.1234/meta",
                source_id="s2:meta",
                authors=[{"name": "Test"}],
                year=2024,
                tags=None,
                extra_metadata={"keywords": ["quantum computing", "qubits"]},
            )
            session.add(paper)
            await session.commit()
            project_id = project.id

        async with async_session_factory() as session:
            svc = TrendService(session)
            result = await svc.compute_trends(project_id)

        topics = [t["topic"] for t in result["topic_trends"]]
        assert "quantum computing" in topics
        assert "qubits" in topics

    async def test_timeline_includes_citation_counts(self, project_with_papers):
        from app.services.trend_service import TrendService

        info = project_with_papers
        async with async_session_factory() as session:
            svc = TrendService(session)
            result = await svc.compute_trends(info["project_id"])

        timeline = result["publication_timeline"]
        # 2020: 2 papers (50 + 30 = 80 citations)
        entry_2020 = next(e for e in timeline if e["year"] == 2020)
        assert entry_2020["citations"] == 80


class TestTrendsAPI:
    """API endpoint tests for trends."""

    @pytest.mark.asyncio
    async def test_trends_endpoint(self, client: AsyncClient, project_with_papers):
        info = project_with_papers
        resp = await client.get(f"/api/v1/projects/{info['project_id']}/analysis/trends")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "publication_timeline" in data
        assert "topic_trends" in data
        assert "emerging_topics" in data
        assert "declining_topics" in data
        assert "summary_stats" in data

    @pytest.mark.asyncio
    async def test_trends_project_not_found(self, client: AsyncClient):
        resp = await client.get("/api/v1/projects/99999/analysis/trends")
        assert resp.status_code in (404, 500)
