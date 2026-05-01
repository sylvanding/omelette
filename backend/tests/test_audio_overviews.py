"""Tests for audio overview generation endpoint and service."""

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
# AudioOverviewService Unit Tests
# ---------------------------------------------------------------------------


class TestAudioOverviewServiceUnit:
    """Unit tests for AudioOverviewService logic."""

    @pytest.mark.asyncio
    async def test_generate_dialogue_returns_structured_data(self):
        """Verify the service returns a dialogue script for given papers."""
        from app.services.audio_overview_service import AudioOverviewService

        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "title": "Test Overview",
            "duration_estimate": "3 min",
            "summary": "A test discussion",
            "script": [
                {"speaker": "Alex", "text": "Welcome to our discussion."},
                {"speaker": "Jordan", "text": "Today we're exploring key findings."},
            ],
        }
        svc = AudioOverviewService(mock_llm)
        result = await svc.generate_dialogue(
            papers=[{"title": "Test Paper", "abstract": "Abstract", "authors": ["A. Author"], "year": 2024}],
            tone="conversational",
        )
        assert "title" in result
        assert "script" in result
        assert len(result["script"]) == 2
        assert result["script"][0]["speaker"] == "Alex"

    @pytest.mark.asyncio
    async def test_handles_llm_failure_gracefully(self):
        """Verify that LLM failures return a fallback dialogue."""
        from app.services.audio_overview_service import AudioOverviewService

        mock_llm = AsyncMock()
        mock_llm.chat_json.side_effect = Exception("LLM error")
        svc = AudioOverviewService(mock_llm)
        result = await svc.generate_dialogue(
            papers=[{"title": "Paper", "abstract": "", "authors": [], "year": 2024}],
            tone="formal",
        )
        assert "title" in result
        assert "script" in result
        assert len(result["script"]) > 0

    @pytest.mark.asyncio
    async def test_fallback_without_llm(self):
        """Verify fallback dialogue when no LLM is configured."""
        from app.services.audio_overview_service import AudioOverviewService

        svc = AudioOverviewService(None)
        result = await svc.generate_dialogue(
            papers=[{"title": "Paper", "abstract": "", "authors": [], "year": 2024}],
        )
        assert "title" in result
        assert result["script"][0]["speaker"] == "Alex"


# ---------------------------------------------------------------------------
# Audio Overview API Tests
# ---------------------------------------------------------------------------


class TestAudioOverviewAPI:
    """Integration tests for the audio overview endpoint."""

    @pytest.mark.asyncio
    async def test_generate_returns_dialogue(self, client: AsyncClient, project_id: int):
        """Verify the endpoint returns a structured dialogue script."""
        # Create a paper first via the papers endpoint
        paper_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Test Paper", "abstract": "A test abstract", "year": 2024},
        )
        assert paper_resp.status_code == 201
        paper_id = paper_resp.json()["data"]["id"]

        resp = await client.post(
            f"/api/v1/projects/{project_id}/audio-overviews",
            json={"paper_ids": [paper_id], "tone": "conversational"},
        )
        assert resp.status_code == 201
        data = resp.json()["data"]
        assert "title" in data
        assert "script" in data
        assert "summary" in data
        assert data["paper_count"] == 1

    @pytest.mark.asyncio
    async def test_rejects_empty_paper_ids(self, client: AsyncClient, project_id: int):
        """Verify the endpoint rejects requests with no paper IDs."""
        resp = await client.post(
            f"/api/v1/projects/{project_id}/audio-overviews",
            json={"paper_ids": [], "tone": "conversational"},
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_rejects_invalid_tone(self, client: AsyncClient, project_id: int):
        """Verify the endpoint rejects invalid tone values."""
        paper_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Test Paper", "abstract": "Abstract", "year": 2024},
        )
        paper_id = paper_resp.json()["data"]["id"]

        resp = await client.post(
            f"/api/v1/projects/{project_id}/audio-overviews",
            json={"paper_ids": [paper_id], "tone": "invalid"},
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_accepts_focus_areas(self, client: AsyncClient, project_id: int):
        """Verify focus areas are accepted in the request."""
        paper_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Test Paper", "abstract": "Abstract", "year": 2024},
        )
        paper_id = paper_resp.json()["data"]["id"]

        resp = await client.post(
            f"/api/v1/projects/{project_id}/audio-overviews",
            json={
                "paper_ids": [paper_id],
                "tone": "formal",
                "focus_areas": ["methodology", "results"],
            },
        )
        assert resp.status_code == 201

    @pytest.mark.asyncio
    async def test_list_returns_overviews(self, client: AsyncClient, project_id: int):
        """Verify the list endpoint returns generated overviews."""
        paper_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Test Paper", "abstract": "Abstract", "year": 2024},
        )
        paper_id = paper_resp.json()["data"]["id"]

        await client.post(
            f"/api/v1/projects/{project_id}/audio-overviews",
            json={"paper_ids": [paper_id], "tone": "conversational"},
        )

        resp = await client.get(f"/api/v1/projects/{project_id}/audio-overviews")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] >= 1
        assert len(data["items"]) >= 1
        assert "title" in data["items"][0]
        assert "duration_estimate" in data["items"][0]

    @pytest.mark.asyncio
    async def test_list_returns_empty_for_project_without_overviews(self, client: AsyncClient, project_id: int):
        """Verify the list endpoint returns empty list when no overviews exist."""
        resp = await client.get(f"/api/v1/projects/{project_id}/audio-overviews")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] == 0
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_delete_removes_overview(self, client: AsyncClient, project_id: int):
        """Verify the delete endpoint removes an audio overview."""
        paper_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Test Paper", "abstract": "Abstract", "year": 2024},
        )
        paper_id = paper_resp.json()["data"]["id"]

        await client.post(
            f"/api/v1/projects/{project_id}/audio-overviews",
            json={"paper_ids": [paper_id], "tone": "conversational"},
        )

        list_resp = await client.get(f"/api/v1/projects/{project_id}/audio-overviews")
        overview_id = list_resp.json()["data"]["items"][0]["id"]

        delete_resp = await client.delete(
            f"/api/v1/projects/{project_id}/audio-overviews/{overview_id}",
        )
        assert delete_resp.status_code == 200

        list_resp2 = await client.get(f"/api/v1/projects/{project_id}/audio-overviews")
        assert list_resp2.json()["data"]["total"] == 0

    @pytest.mark.asyncio
    async def test_delete_returns_404_for_missing_overview(self, client: AsyncClient, project_id: int):
        """Verify deleting a non-existent overview returns 404."""
        resp = await client.delete(
            f"/api/v1/projects/{project_id}/audio-overviews/9999",
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_is_scoped_to_project(self, client: AsyncClient, project_id: int):
        """Verify that deleting an overview from another project fails."""
        other_resp = await client.post("/api/v1/projects", json={"name": "Other Project"})
        other_id = other_resp.json()["data"]["id"]

        paper_resp = await client.post(
            f"/api/v1/projects/{project_id}/papers",
            json={"title": "Test Paper", "abstract": "Abstract", "year": 2024},
        )
        paper_id = paper_resp.json()["data"]["id"]

        await client.post(
            f"/api/v1/projects/{project_id}/audio-overviews",
            json={"paper_ids": [paper_id], "tone": "conversational"},
        )

        list_resp = await client.get(f"/api/v1/projects/{project_id}/audio-overviews")
        overview_id = list_resp.json()["data"]["items"][0]["id"]

        # Try to delete from other project — should fail
        delete_resp = await client.delete(
            f"/api/v1/projects/{other_id}/audio-overviews/{overview_id}",
        )
        assert delete_resp.status_code == 404
