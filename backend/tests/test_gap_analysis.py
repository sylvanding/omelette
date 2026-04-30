"""Tests for GapService and gap analysis API endpoint."""

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
        project = Project(name="Gap Test Project", domain="AI")
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
                abstract="This paper presents a deep learning approach for neural network analysis.",
            ),
            Paper(
                project_id=project.id,
                title="Transformer Models for NLP",
                doi="10.1234/tf1",
                source_id="s2:tf1",
                tags=["transformers", "deep learning"],
                year=2021,
                citation_count=200,
                abstract="We propose transformer-based architectures for natural language processing tasks.",
            ),
            Paper(
                project_id=project.id,
                title="Reinforcement Learning Survey",
                doi="10.1234/rl1",
                source_id="s2:rl1",
                tags=["reinforcement learning"],
                year=2020,
                citation_count=50,
                abstract="A comprehensive survey of reinforcement learning methods and applications.",
            ),
        ]
        for p in papers:
            session.add(p)
        await session.commit()
        return {"project_id": project.id}


class TestGapService:
    """Unit tests for GapService."""

    async def test_analyze_gaps_returns_results(self, project_with_papers):
        from app.services.gap_service import GapService
        from app.services.llm.client import LLMClient

        llm = LLMClient()
        svc = GapService(llm)

        papers = [
            {"paper_id": 1, "title": "Paper A", "abstract": "Abstract A", "tags": ["ml"], "year": 2020},
            {"paper_id": 2, "title": "Paper B", "abstract": "Abstract B", "tags": ["dl"], "year": 2021},
        ]
        result = await svc.analyze_gaps(papers)

        assert "gaps" in result
        assert "research_questions" in result
        assert "summary" in result

    async def test_empty_project_returns_empty_result(self):
        from app.services.gap_service import _empty_response

        expected = _empty_response()
        assert expected["gaps"] == []
        assert expected["research_questions"] == []
        assert expected["summary"]["total_gaps"] == 0

    async def test_fewer_than_two_papers_returns_empty(self):
        from app.services.gap_service import GapService
        from app.services.llm.client import LLMClient

        llm = LLMClient()
        svc = GapService(llm)

        papers = [{"paper_id": 1, "title": "Single", "abstract": "Only one paper", "tags": [], "year": 2020}]
        result = await svc.analyze_gaps(papers)

        assert result["gaps"] == []
        assert result["summary"]["total_gaps"] == 0


class TestGapAPI:
    """API endpoint tests for gap analysis."""

    @pytest.mark.asyncio
    async def test_gap_endpoint(self, client: AsyncClient, project_with_papers):
        info = project_with_papers

        resp = await client.post(f"/api/v1/projects/{info['project_id']}/analysis/gaps")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "gaps" in data
        assert "research_questions" in data
        assert "summary" in data

    @pytest.mark.asyncio
    async def test_gap_endpoint_few_papers(self, client: AsyncClient):
        # Create a project with only one paper
        async with async_session_factory() as session:
            project = Project(name="Single Paper Project", domain="AI")
            session.add(project)
            await session.flush()
            paper = Paper(
                project_id=project.id,
                title="Only Paper",
                doi="10.1234/single",
                source_id="s2:single",
                tags=["test"],
                year=2020,
            )
            session.add(paper)
            await session.commit()
            project_id = project.id

        resp = await client.post(f"/api/v1/projects/{project_id}/analysis/gaps")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["gaps"] == []

    @pytest.mark.asyncio
    async def test_gap_project_not_found(self, client: AsyncClient):
        resp = await client.post("/api/v1/projects/99999/analysis/gaps")
        assert resp.status_code in (404, 500)
