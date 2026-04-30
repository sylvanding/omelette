"""Tests for evidence consensus endpoint."""

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


def _mock_retrieve_with_papers():
    """Return a mock retrieve_only that returns sample papers."""
    return [
        {
            "paper_id": 1,
            "paper_title": "Deep Learning for Microscopy",
            "page_number": 1,
            "chunk_type": "abstract",
            "section": "abstract",
            "relevance_score": 0.85,
            "excerpt": "Our deep learning method achieves 2x resolution improvement over traditional approaches in fluorescence microscopy.",
        },
        {
            "paper_id": 2,
            "paper_title": "Limitations of AI in Imaging",
            "page_number": 1,
            "chunk_type": "abstract",
            "section": "abstract",
            "relevance_score": 0.72,
            "excerpt": "Neural reconstruction introduces systematic artifacts that degrade image fidelity in practice.",
        },
        {
            "paper_id": 3,
            "paper_title": "Hybrid Imaging Methods",
            "page_number": 1,
            "chunk_type": "abstract",
            "section": "abstract",
            "relevance_score": 0.65,
            "excerpt": "Hybrid approaches demonstrate variable success depending on specimen characteristics.",
        },
    ]


# ---------------------------------------------------------------------------
# Evidence Consensus API Tests
# ---------------------------------------------------------------------------


class TestEvidenceConsensusAPI:
    """Tests for /api/v1/projects/{project_id}/rag/evidence-consensus endpoint."""

    @pytest.mark.asyncio
    async def test_consensus_returns_structured_data(self, client: AsyncClient, project_id: int):
        """Verify the endpoint returns structured consensus data with counts and percentages."""
        with patch(
            "app.api.v1.rag.RAGService.retrieve_only",
            new_callable=lambda: AsyncMock(return_value=_mock_retrieve_with_papers()),
        ):
            resp = await client.post(
                f"/api/v1/projects/{project_id}/rag/evidence-consensus",
                json={"question": "Does deep learning improve microscopy resolution?"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        data = body["data"]
        assert "support_count" in data
        assert "contradict_count" in data
        assert "mixed_count" in data
        assert "support_percentage" in data
        assert "contradict_percentage" in data
        assert "mixed_percentage" in data
        assert "papers" in data
        assert "overall_confidence" in data
        assert isinstance(data["papers"], list)

    @pytest.mark.asyncio
    async def test_consensus_returns_one_line_findings_per_paper(self, client: AsyncClient, project_id: int):
        """Verify each paper result includes a finding field."""
        with patch(
            "app.api.v1.rag.RAGService.retrieve_only",
            new_callable=lambda: AsyncMock(return_value=_mock_retrieve_with_papers()),
        ):
            resp = await client.post(
                f"/api/v1/projects/{project_id}/rag/evidence-consensus",
                json={"question": "Does deep learning improve microscopy resolution?"},
            )
        assert resp.status_code == 200
        body = resp.json()
        papers = body["data"]["papers"]
        assert len(papers) > 0
        for paper in papers:
            assert "finding" in paper
            assert isinstance(paper["finding"], str)
            assert "stance" in paper
            assert paper["stance"] in ("support", "contradict", "mixed")

    @pytest.mark.asyncio
    async def test_consensus_confidence_scores_bounded(self, client: AsyncClient, project_id: int):
        """Verify all confidence scores are bounded between 0 and 1."""
        with patch(
            "app.api.v1.rag.RAGService.retrieve_only",
            new_callable=lambda: AsyncMock(return_value=_mock_retrieve_with_papers()),
        ):
            resp = await client.post(
                f"/api/v1/projects/{project_id}/rag/evidence-consensus",
                json={"question": "Does deep learning improve microscopy resolution?"},
            )
        assert resp.status_code == 200
        body = resp.json()
        data = body["data"]
        # Overall confidence bounded
        assert 0.0 <= data["overall_confidence"] <= 1.0
        # Per-paper confidence bounded
        for paper in data["papers"]:
            assert 0.0 <= paper["confidence"] <= 1.0, (
                f"Confidence {paper['confidence']} out of bounds for {paper['paper_title']}"
            )

    @pytest.mark.asyncio
    async def test_consensus_percentages_sum_to_100(self, client: AsyncClient, project_id: int):
        """Verify the percentage breakdown sums to approximately 100%."""
        with patch(
            "app.api.v1.rag.RAGService.retrieve_only",
            new_callable=lambda: AsyncMock(return_value=_mock_retrieve_with_papers()),
        ):
            resp = await client.post(
                f"/api/v1/projects/{project_id}/rag/evidence-consensus",
                json={"question": "Does deep learning improve microscopy resolution?"},
            )
        assert resp.status_code == 200
        body = resp.json()
        data = body["data"]
        total_pct = data["support_percentage"] + data["contradict_percentage"] + data["mixed_percentage"]
        assert abs(total_pct - 100.0) < 1.0  # Allow rounding error across 3 percentages

    @pytest.mark.asyncio
    async def test_consensus_empty_retrieval_returns_zeroes(self, client: AsyncClient, project_id: int):
        """Verify that when no papers are retrieved, all counts are zero."""
        with patch(
            "app.api.v1.rag.RAGService.retrieve_only",
            new_callable=lambda: AsyncMock(return_value=[]),
        ):
            resp = await client.post(
                f"/api/v1/projects/{project_id}/rag/evidence-consensus",
                json={"question": "Some obscure question?"},
            )
        assert resp.status_code == 200
        body = resp.json()
        data = body["data"]
        assert data["support_count"] == 0
        assert data["contradict_count"] == 0
        assert data["mixed_count"] == 0
        assert data["total_papers"] == 0
        assert data["papers"] == []
        assert data["overall_confidence"] == 0.0
