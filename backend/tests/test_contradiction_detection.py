"""Tests for contradiction detection endpoint and service."""

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


def _make_mock_paper(paper_id: int, title: str, abstract: str):
    """Create a mock paper object with needed attributes."""
    paper = MagicMock()
    paper.id = paper_id
    paper.title = title
    paper.abstract = abstract
    return paper


# ---------------------------------------------------------------------------
# Contradiction Service Unit Tests
# ---------------------------------------------------------------------------


class TestContradictionServiceUnit:
    """Unit tests for ContradictionService logic."""

    @pytest.mark.asyncio
    async def test_empty_papers_returns_empty(self):
        """Verify that zero papers returns empty results."""
        from app.services.contradiction_service import ContradictionService

        svc = ContradictionService(AsyncMock())
        result = await svc.detect_contradictions([])
        assert result["contradictions"] == []
        assert result["total_contradictions"] == 0

    @pytest.mark.asyncio
    async def test_single_paper_returns_empty(self):
        """Verify that a single paper returns empty results."""
        from app.services.contradiction_service import ContradictionService

        svc = ContradictionService(AsyncMock())
        result = await svc.detect_contradictions([{"paper_id": 1, "title": "Only Paper", "abstract": "Abstract"}])
        assert result["contradictions"] == []
        assert result["total_contradictions"] == 0

    @pytest.mark.asyncio
    async def test_detects_known_conflicts(self):
        """Verify detection finds known conflicts between papers."""
        from app.services.contradiction_service import ContradictionService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "contradictions": [
                {
                    "paper_a_id": 1,
                    "paper_a_title": "Paper A",
                    "paper_b_id": 2,
                    "paper_b_title": "Paper B",
                    "claim": "Test claim",
                    "position_a": "Position A",
                    "position_b": "Position B",
                    "confidence": 0.88,
                    "topic": "Test Topic",
                },
            ],
            "topics": ["Test Topic"],
        }
        svc = ContradictionService(mock_llm)
        result = await svc.detect_contradictions(
            [
                {"paper_id": 1, "title": "Paper A", "abstract": "Abstract A"},
                {"paper_id": 2, "title": "Paper B", "abstract": "Abstract B"},
            ]
        )
        assert len(result["contradictions"]) == 1
        assert result["contradictions"][0]["paper_a_id"] == 1
        assert result["contradictions"][0]["paper_b_id"] == 2
        assert result["total_contradictions"] == 1

    @pytest.mark.asyncio
    async def test_no_false_positives_on_agreeing_papers(self):
        """Verify no false positives when LLM returns no contradictions."""
        from app.services.contradiction_service import ContradictionService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {"contradictions": [], "topics": []}
        svc = ContradictionService(mock_llm)
        result = await svc.detect_contradictions(
            [
                {"paper_id": 1, "title": "A", "abstract": "Agreeing paper A"},
                {"paper_id": 2, "title": "B", "abstract": "Agreeing paper B"},
            ]
        )
        assert result["contradictions"] == []
        assert result["total_contradictions"] == 0

    @pytest.mark.asyncio
    async def test_confidence_scores_bounded(self):
        """Verify confidence scores are clamped to [0, 1]."""
        from app.services.contradiction_service import ContradictionService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "contradictions": [
                {
                    "paper_a_id": 1,
                    "paper_a_title": "A",
                    "paper_b_id": 2,
                    "paper_b_title": "B",
                    "claim": "C",
                    "position_a": "PA",
                    "position_b": "PB",
                    "confidence": 1.5,
                    "topic": "T",
                },
                {
                    "paper_a_id": 3,
                    "paper_a_title": "C",
                    "paper_b_id": 4,
                    "paper_b_title": "D",
                    "claim": "C2",
                    "position_a": "PC",
                    "position_b": "PD",
                    "confidence": -0.3,
                    "topic": "T2",
                },
            ],
            "topics": ["T", "T2"],
        }
        svc = ContradictionService(mock_llm)
        result = await svc.detect_contradictions(
            [
                {"paper_id": 1, "title": "A", "abstract": ""},
                {"paper_id": 2, "title": "B", "abstract": ""},
            ]
        )
        for c in result["contradictions"]:
            assert 0.0 <= c["confidence"] <= 1.0

    @pytest.mark.asyncio
    async def test_contradictions_grouped_by_topic(self):
        """Verify contradictions include topic grouping."""
        from app.services.contradiction_service import ContradictionService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "contradictions": [
                {
                    "paper_a_id": 1,
                    "paper_a_title": "A",
                    "paper_b_id": 2,
                    "paper_b_title": "B",
                    "claim": "C1",
                    "position_a": "PA",
                    "position_b": "PB",
                    "confidence": 0.85,
                    "topic": "Resolution",
                },
                {
                    "paper_a_id": 3,
                    "paper_a_title": "C",
                    "paper_b_id": 4,
                    "paper_b_title": "D",
                    "claim": "C2",
                    "position_a": "PC",
                    "position_b": "PD",
                    "confidence": 0.78,
                    "topic": "Sensitivity",
                },
            ],
            "topics": ["Resolution", "Sensitivity"],
        }
        svc = ContradictionService(mock_llm)
        result = await svc.detect_contradictions(
            [
                {"paper_id": 1, "title": "A", "abstract": ""},
                {"paper_id": 2, "title": "B", "abstract": ""},
            ]
        )
        assert "Resolution" in result["topics"]
        assert "Sensitivity" in result["topics"]


# ---------------------------------------------------------------------------
# API Endpoint Tests
# ---------------------------------------------------------------------------


class TestContradictionDetectionAPI:
    """Tests for /api/v1/projects/{project_id}/analysis/contradictions endpoint."""

    @pytest.mark.asyncio
    async def test_empty_project_returns_zeroes(self, client: AsyncClient, project_id: int):
        """Verify that a project with fewer than 2 papers returns empty results."""
        resp = await client.post(
            f"/api/v1/projects/{project_id}/analysis/contradictions",
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == 200
        data = body["data"]
        assert data["contradictions"] == []
        assert data["total_contradictions"] == 0

    @pytest.mark.asyncio
    async def test_endpoint_returns_structured_data(self, client: AsyncClient, project_id: int):
        """Verify the endpoint returns structured contradiction data with required fields."""
        from app.api.deps import get_db

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [
            _make_mock_paper(1, "Paper A", "Abstract A"),
            _make_mock_paper(2, "Paper B", "Abstract B"),
        ]

        async def mock_get_db():
            mock_session = AsyncMock()
            mock_session.execute.return_value = mock_result
            yield mock_session

        app.dependency_overrides[get_db] = mock_get_db
        try:
            with patch(
                "app.services.contradiction_service.ContradictionService.detect_contradictions",
                new_callable=AsyncMock,
                return_value={
                    "contradictions": [
                        {
                            "paper_a_id": 1,
                            "paper_a_title": "Paper A",
                            "paper_b_id": 2,
                            "paper_b_title": "Paper B",
                            "claim": "Test claim",
                            "position_a": "Position A",
                            "position_b": "Position B",
                            "confidence": 0.88,
                            "topic": "Test Topic",
                        }
                    ],
                    "topics": ["Test Topic"],
                    "total_contradictions": 1,
                },
            ):
                resp = await client.post(
                    f"/api/v1/projects/{project_id}/analysis/contradictions",
                )
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert resp.status_code == 200
        body = resp.json()
        data = body["data"]
        assert len(data["contradictions"]) == 1
        c = data["contradictions"][0]
        for field in ["paper_a_id", "paper_b_id", "claim", "position_a", "position_b", "confidence", "topic"]:
            assert field in c, f"Missing field: {field}"
