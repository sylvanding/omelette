"""Tests for systematic review CRUD endpoints and data extraction."""

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
# Review Service Unit Tests
# ---------------------------------------------------------------------------


class TestReviewServiceUnit:
    """Unit tests for ReviewService logic."""

    @pytest.mark.asyncio
    async def test_extract_returns_structured_data(self):
        """Verify the service returns extracted data for given papers."""
        from app.services.review_service import ReviewService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "extracted_data": {
                "sample_size": "200 patients",
                "methodology": "Double-blind RCT",
            },
            "confidence": 0.92,
        }
        svc = ReviewService(mock_llm)
        result = await svc.extract_paper_data(
            {"paper_id": 1, "title": "Test Paper", "abstract": "Abstract"},
            [
                {"name": "sample_size", "description": "Number of subjects"},
                {"name": "methodology", "description": "Study design"},
            ],
        )
        assert "extracted_data" in result
        assert result["confidence"] == 0.92
        assert "sample_size" in result["extracted_data"]

    @pytest.mark.asyncio
    async def test_handles_llm_failure_gracefully(self):
        """Verify that LLM failures return empty data without raising."""
        from app.services.review_service import ReviewService

        mock_llm = AsyncMock()
        mock_llm.chat_json.side_effect = Exception("LLM error")
        svc = ReviewService(mock_llm)
        result = await svc.extract_paper_data(
            {"paper_id": 1, "title": "A", "abstract": ""},
            [{"name": "sample_size", "description": "Size"}],
        )
        assert "extracted_data" in result
        assert result["confidence"] == 0.0

    @pytest.mark.asyncio
    async def test_export_csv_produces_valid_output(self):
        """Verify CSV export produces parseable output."""
        from app.services.review_service import ReviewService

        svc = ReviewService(None)
        columns = [{"name": "sample_size"}, {"name": "methodology"}]
        extractions = [
            {"paper_id": 1, "extracted_data": {"sample_size": "100", "methodology": "RCT"}},
            {"paper_id": 2, "extracted_data": {"sample_size": "50", "methodology": "Cohort"}},
        ]
        papers = {
            1: {"title": "Paper A", "year": 2024, "citation_count": 10},
            2: {"title": "Paper B", "year": 2023, "citation_count": 5},
        }
        csv_content = svc.export_to_csv(columns, extractions, papers)
        assert "Paper ID" in csv_content
        assert "sample_size" in csv_content
        assert "100" in csv_content

    @pytest.mark.asyncio
    async def test_handles_string_extracted_data_in_export(self):
        """Verify export handles stringified JSON in extracted_data."""
        import json

        from app.services.review_service import ReviewService

        svc = ReviewService(None)
        columns = [{"name": "outcome"}]
        extractions = [
            {"paper_id": 1, "extracted_data": json.dumps({"outcome": "positive"})},
        ]
        papers = {1: {"title": "Paper", "year": 2024, "citation_count": 0}}
        csv_content = svc.export_to_csv(columns, extractions, papers)
        assert "positive" in csv_content


# ---------------------------------------------------------------------------
# Review API Endpoint Tests
# ---------------------------------------------------------------------------


class TestReviewAPI:
    """Tests for /api/v1/projects/{project_id}/reviews endpoints."""

    @pytest.mark.asyncio
    async def test_create_review(self, client: AsyncClient, project_id: int):
        """Verify review creation returns 201."""
        resp = await client.post(
            f"/api/v1/projects/{project_id}/reviews",
            json={
                "title": "Systematic Review of Deep Learning in Microscopy",
                "research_question": "Does deep learning improve microscopy resolution?",
                "columns": [
                    {"name": "sample_size", "description": "Number of participants"},
                    {"name": "methodology", "description": "Study design"},
                ],
                "paper_ids": [],
            },
        )
        assert resp.status_code == 201
        data = resp.json()["data"]
        assert data["title"] == "Systematic Review of Deep Learning in Microscopy"
        assert len(data["columns"]) == 2

    @pytest.mark.asyncio
    async def test_list_reviews_empty(self, client: AsyncClient, project_id: int):
        """Verify empty list returns zero reviews."""
        resp = await client.get(f"/api/v1/projects/{project_id}/reviews")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["reviews"] == []

    @pytest.mark.asyncio
    async def test_list_reviews_after_create(self, client: AsyncClient, project_id: int):
        """Verify list returns created reviews."""
        await client.post(
            f"/api/v1/projects/{project_id}/reviews",
            json={"title": "Review A", "paper_ids": []},
        )
        await client.post(
            f"/api/v1/projects/{project_id}/reviews",
            json={"title": "Review B", "paper_ids": []},
        )
        resp = await client.get(f"/api/v1/projects/{project_id}/reviews")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["reviews"]) == 2
        titles = {r["title"] for r in data["reviews"]}
        assert "Review A" in titles
        assert "Review B" in titles

    @pytest.mark.asyncio
    async def test_update_review(self, client: AsyncClient, project_id: int):
        """Verify review update works."""
        create_resp = await client.post(
            f"/api/v1/projects/{project_id}/reviews",
            json={"title": "Old Title", "paper_ids": []},
        )
        review_id = create_resp.json()["data"]["id"]

        update_resp = await client.put(
            f"/api/v1/projects/{project_id}/reviews/{review_id}",
            json={"title": "New Title", "research_question": "Updated question"},
        )
        assert update_resp.status_code == 200
        data = update_resp.json()["data"]
        assert data["title"] == "New Title"
        assert data["research_question"] == "Updated question"

    @pytest.mark.asyncio
    async def test_delete_review(self, client: AsyncClient, project_id: int):
        """Verify review deletion works."""
        create_resp = await client.post(
            f"/api/v1/projects/{project_id}/reviews",
            json={"title": "To Delete", "paper_ids": []},
        )
        review_id = create_resp.json()["data"]["id"]

        delete_resp = await client.delete(
            f"/api/v1/projects/{project_id}/reviews/{review_id}",
        )
        assert delete_resp.status_code == 200

        list_resp = await client.get(f"/api/v1/projects/{project_id}/reviews")
        assert len(list_resp.json()["data"]["reviews"]) == 0

    @pytest.mark.asyncio
    async def test_review_not_found(self, client: AsyncClient, project_id: int):
        """Verify 404 for non-existent review."""
        resp = await client.put(
            f"/api/v1/projects/{project_id}/reviews/99999",
            json={"title": "Nope"},
        )
        assert resp.status_code == 404


class TestExtractionAPI:
    """Tests for review extraction endpoints."""

    @pytest.mark.asyncio
    async def test_extract_returns_structured_data(self, client: AsyncClient, project_id: int):
        """Verify extraction returns structured data with confidence."""
        # Create papers
        p1 = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Deep Learning Paper", "abstract": "A study using deep learning"},
        )
        pid1 = p1.json()["data"]["id"]

        # Create review with papers
        review_resp = await client.post(
            f"/api/v1/projects/{project_id}/reviews",
            json={
                "title": "Test Review",
                "columns": [
                    {"name": "sample_size"},
                    {"name": "methodology"},
                ],
                "paper_ids": [pid1],
            },
        )
        review_id = review_resp.json()["data"]["id"]

        # Run extraction
        extract_resp = await client.post(
            f"/api/v1/projects/{project_id}/reviews/{review_id}/extract",
        )
        assert extract_resp.status_code == 200
        data = extract_resp.json()["data"]
        assert data["status"] == "complete"
        assert data["total_papers"] == 1
        assert data["completed"] == 1
        assert len(data["results"]) == 1
        result = data["results"][0]
        assert "extracted_data" in result
        assert "confidence" in result

    @pytest.mark.asyncio
    async def test_extract_empty_review(self, client: AsyncClient, project_id: int):
        """Verify extraction on empty review returns zero papers."""
        review_resp = await client.post(
            f"/api/v1/projects/{project_id}/reviews",
            json={
                "title": "Empty Review",
                "columns": [{"name": "outcome"}],
                "paper_ids": [],
            },
        )
        review_id = review_resp.json()["data"]["id"]

        extract_resp = await client.post(
            f"/api/v1/projects/{project_id}/reviews/{review_id}/extract",
        )
        assert extract_resp.status_code == 200
        data = extract_resp.json()["data"]
        assert data["total_papers"] == 0
        assert data["results"] == []

    @pytest.mark.asyncio
    async def test_get_extractions(self, client: AsyncClient, project_id: int):
        """Verify extraction results can be retrieved."""
        p1 = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Paper", "abstract": "Abstract"},
        )
        pid1 = p1.json()["data"]["id"]

        review_resp = await client.post(
            f"/api/v1/projects/{project_id}/reviews",
            json={
                "title": "Test",
                "columns": [{"name": "methodology"}],
                "paper_ids": [pid1],
            },
        )
        review_id = review_resp.json()["data"]["id"]

        # Run extraction first
        await client.post(
            f"/api/v1/projects/{project_id}/reviews/{review_id}/extract",
        )

        # Get extractions
        resp = await client.get(
            f"/api/v1/projects/{project_id}/reviews/{review_id}/extractions",
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["status"] == "complete"
        assert len(data["results"]) == 1
