"""Tests for CitationGraphService and citation graph API endpoints."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, async_session_factory, engine
from app.main import app
from app.models import Paper, PaperStatus, Project


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
async def project_with_paper():
    async with async_session_factory() as session:
        project = Project(name="Graph Test Project", domain="AI")
        session.add(project)
        await session.flush()

        paper = Paper(
            project_id=project.id,
            title="Attention Is All You Need",
            abstract="We propose a new architecture...",
            doi="10.1234/test",
            source_id="s2:12345",
            journal="NeurIPS",
            year=2017,
            citation_count=50000,
            status=PaperStatus.INDEXED,
        )
        session.add(paper)
        await session.commit()
        return {"project_id": project.id, "paper_id": paper.id}


MOCK_S2_PAPER = {
    "paperId": "abc123",
    "title": "Attention Is All You Need",
    "year": 2017,
    "citationCount": 50000,
    "authors": [{"name": "Vaswani"}, {"name": "Shazeer"}],
}

MOCK_S2_CITATIONS = {
    "data": [
        {
            "citingPaper": {
                "paperId": "cite1",
                "title": "BERT: Pre-training",
                "year": 2019,
                "citationCount": 30000,
                "authors": [{"name": "Devlin"}],
            }
        },
    ]
}

MOCK_S2_REFERENCES = {
    "data": [
        {
            "citedPaper": {
                "paperId": "ref1",
                "title": "Sequence to Sequence Learning",
                "year": 2014,
                "citationCount": 10000,
                "authors": [{"name": "Sutskever"}],
            }
        },
    ]
}


class TestCitationGraphService:
    """Unit tests for CitationGraphService."""

    async def test_graph_returns_nodes_and_edges(self, project_with_paper):
        from app.services.citation_graph_service import CitationGraphService

        info = project_with_paper

        mock_fetch_list = AsyncMock(
            side_effect=lambda url, limit: (
                MOCK_S2_CITATIONS["data"]
                if "citations" in url
                else MOCK_S2_REFERENCES["data"]
                if "references" in url
                else []
            )
        )

        async with async_session_factory() as session:
            svc = CitationGraphService(session)
            with (
                patch.object(svc, "_fetch_s2_list", mock_fetch_list),
                patch.object(
                    svc,
                    "_resolve_s2_id",
                    AsyncMock(return_value="abc123"),
                ),
            ):
                graph = await svc.get_citation_graph(info["paper_id"], info["project_id"], depth=1, max_nodes=50)

        assert "nodes" in graph
        assert "edges" in graph
        assert "center_id" in graph
        assert len(graph["nodes"]) >= 1

    async def test_graph_empty_when_no_s2_id(self, project_with_paper):
        from app.services.citation_graph_service import CitationGraphService

        info = project_with_paper

        async with async_session_factory() as session:
            svc = CitationGraphService(session)
            with patch.object(
                svc,
                "_resolve_s2_id",
                AsyncMock(return_value=None),
            ):
                graph = await svc.get_citation_graph(info["paper_id"], info["project_id"])

        assert graph["nodes"] == []
        assert graph["edges"] == []


class TestCitationGraphAPI:
    """API endpoint tests for citation graph."""

    @pytest.mark.asyncio
    async def test_citation_graph_endpoint(self, client: AsyncClient, project_with_paper):
        info = project_with_paper
        mock_graph = {
            "nodes": [
                {
                    "id": "abc123",
                    "title": "Test",
                    "year": 2017,
                    "citation_count": 100,
                    "is_local": True,
                }
            ],
            "edges": [],
            "center_id": "abc123",
        }

        with patch("app.services.citation_graph_service.CitationGraphService") as mock_svc_cls:
            instance = mock_svc_cls.return_value
            instance.get_citation_graph = AsyncMock(return_value=mock_graph)

            resp = await client.get(f"/api/v1/projects/{info['project_id']}/papers/{info['paper_id']}/citation-graph")
            assert resp.status_code == 200
            data = resp.json()["data"]
            assert "nodes" in data
            assert "edges" in data

    @pytest.mark.asyncio
    async def test_citation_graph_paper_not_found(self, client: AsyncClient):
        resp = await client.get("/api/v1/projects/1/papers/99999/citation-graph")
        assert resp.status_code in (404, 500)

    @pytest.mark.asyncio
    async def test_pdf_serve_not_found(self, client: AsyncClient):
        resp = await client.get("/api/v1/projects/1/papers/99999/pdf")
        assert resp.status_code in (404, 500)
